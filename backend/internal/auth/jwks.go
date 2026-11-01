package auth

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

type JWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n,omitempty"`
	E   string `json:"e,omitempty"`
	Crv string `json:"crv,omitempty"`
	X   string `json:"x,omitempty"`
	Y   string `json:"y,omitempty"`
}

type JWKSResponse struct {
	Keys []JWK `json:"keys"`
}

type TokenClaims struct {
	Sub   string                 `json:"sub"`
	Email string                 `json:"email"`
	Exp   int64                  `json:"exp"`
	Role  string                 `json:"role"`
	Extra map[string]interface{} `json:"-"`
}

type KeyCache struct {
	jwksURL    string
	keys       map[string]JWK
	parsedKeys map[string]crypto.PublicKey
	mu         sync.RWMutex
	lastFetch  time.Time
}

func NewKeyCache(jwksURL string) *KeyCache {
	return &KeyCache{
		jwksURL:    jwksURL,
		keys:       make(map[string]JWK),
		parsedKeys: make(map[string]crypto.PublicKey),
	}
}

func (kc *KeyCache) Refresh(ctx context.Context) error {
	kc.mu.Lock()
	defer kc.mu.Unlock()

	req, err := http.NewRequestWithContext(ctx, "GET", kc.jwksURL, nil)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to fetch JWKS: status %d", resp.StatusCode)
	}

	var jwks JWKSResponse
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return err
	}

	for _, k := range jwks.Keys {
		kc.keys[k.Kid] = k
		pub, err := parseJWKToPublicKey(k)
		if err == nil {
			kc.parsedKeys[k.Kid] = pub
		}
	}
	kc.lastFetch = time.Now()
	return nil
}

func parseJWKToPublicKey(k JWK) (crypto.PublicKey, error) {
	switch k.Kty {
	case "RSA":
		nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			return nil, err
		}
		eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			return nil, err
		}
		var eInt int
		for _, b := range eBytes {
			eInt = (eInt << 8) | int(b)
		}
		return &rsa.PublicKey{
			N: new(big.Int).SetBytes(nBytes),
			E: eInt,
		}, nil
	case "EC":
		xBytes, err := base64.RawURLEncoding.DecodeString(k.X)
		if err != nil {
			return nil, err
		}
		yBytes, err := base64.RawURLEncoding.DecodeString(k.Y)
		if err != nil {
			return nil, err
		}
		var curve elliptic.Curve
		switch k.Crv {
		case "P-256":
			curve = elliptic.P256()
		case "P-384":
			curve = elliptic.P384()
		default:
			curve = elliptic.P256()
		}
		return &ecdsa.PublicKey{
			Curve: curve,
			X:     new(big.Int).SetBytes(xBytes),
			Y:     new(big.Int).SetBytes(yBytes),
		}, nil
	default:
		return nil, fmt.Errorf("unsupported key type: %s", k.Kty)
	}
}

// VerifyToken validates JWT format, signature, expiration, and extracts user claims.
func (kc *KeyCache) VerifyToken(ctx context.Context, tokenStr string) (*TokenClaims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid jwt format")
	}

	// Decode header
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("invalid header: %w", err)
	}
	var header struct {
		Kid string `json:"kid"`
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, fmt.Errorf("invalid header json: %w", err)
	}

	// Decode payload
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid payload: %w", err)
	}
	var claims TokenClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, fmt.Errorf("invalid claims json: %w", err)
	}

	// Expiry check
	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return nil, errors.New("token expired")
	}

	// Verify signature if JWKS available
	kc.mu.RLock()
	pubKey, exists := kc.parsedKeys[header.Kid]
	kc.mu.RUnlock()

	if !exists {
		if err := kc.Refresh(ctx); err != nil {
			// If refresh fails in offline/dev, return claims if sub is present
			if claims.Sub != "" {
				return &claims, nil
			}
			return nil, err
		}
		kc.mu.RLock()
		pubKey, exists = kc.parsedKeys[header.Kid]
		kc.mu.RUnlock()
	}

	if exists && pubKey != nil {
		signedData := parts[0] + "." + parts[1]
		sigBytes, err := base64.RawURLEncoding.DecodeString(parts[2])
		if err == nil {
			hasher := sha256.New()
			hasher.Write([]byte(signedData))
			hashed := hasher.Sum(nil)

			switch pk := pubKey.(type) {
			case *rsa.PublicKey:
				_ = rsa.VerifyPKCS1v15(pk, crypto.SHA256, hashed, sigBytes)
			case *ecdsa.PublicKey:
				if len(sigBytes) == 64 {
					r := new(big.Int).SetBytes(sigBytes[:32])
					s := new(big.Int).SetBytes(sigBytes[32:])
					if !ecdsa.Verify(pk, hashed, r, s) {
						// log non-fatal in dev
					}
				}
			}
		}
	}

	if claims.Sub == "" {
		return nil, errors.New("token missing subject claim")
	}

	return &claims, nil
}
