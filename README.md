# Personal Finance Manager (PWA + Android TWA APK)

Una aplicación móvil y web progresiva (**PWA**) empaquetable como **APK instalable para Android (TWA)**, diseñada para ofrecer claridad total e inmediata sobre las finanzas personales:
1. **¿A dónde se va mi dinero?**: Desglose visual por categorías (Hogar, Servicios, Familia, Obligaciones, Transporte, Extras) y registro detallado por billetera.
2. **Estado Financiero Actual**: Saldo líquido disponible (`Total Actual`), saldo restante tras facturas pendientes del mes (`Restante`), y colchón proyectado tras recaudar arriendos y reservar el próximo ciclo (`Incl. Pendientes`).
3. **Proyecciones de Disponibilidad**: Proyecciones exactas de cuánto dinero tendrás disponible al **Fin de Semana**, al **Fin de Mes** y al **Fin de Año**.

---

## 🔒 Arquitectura de Privacidad (Offline-First)

- **Almacenamiento 100% en el dispositivo Aislado por Usuario**: Todos tus datos financieros se guardan localmente en la memoria de tu dispositivo mediante **IndexedDB** (`Dexie.js`), particionados físicamente por `userId`. Cada usuario tiene su propio espacio de datos completamente aislado.
- **Autenticación Obligatoria (`/login`)**: El acceso está protegido a nivel de middleware. Cada usuario inicia sesión o crea una cuenta para gestionar sus finanzas personales.
- **Importador de Excel en Memoria**: Carga directamente tu hoja de cálculo desde tu dispositivo en la sección **Ajustes -> Importar Excel**. La lectura se ejecuta 100% en el navegador del cliente; el archivo nunca se sube a ningún servidor externo.
- **Protección de Secretos y Repositorio**: El archivo `.gitignore` excluye estrictamente `.env*`, `*.xlsx`, `*.keystore` y binarios de compilación para garantizar que ninguna información privada se publique en GitHub.

---

## 🚀 Tecnologías

- **Frontend**: [Next.js](https://nextjs.org/) (App Router, React 18, TypeScript) + [Tailwind CSS](https://tailwindcss.com/) + Lucide Icons.
- **Base de Datos Local**: [Dexie.js](https://dexie.org/) (IndexedDB reactivo y offline).
- **Integración Supabase**:
  - `@supabase/supabase-js` y `@supabase/ssr` (autenticación y sesiones en cliente/servidor).
  - `@supabase/server` (Route Handlers en Next.js con verificación asimétrica de tokens mediante `SUPABASE_JWKS_URL`).
- **Backend Golang**: API REST en Go 1.22+ (`backend/`) con verificación de JWT vía JWKS, endpoints de sincronización `/api/v1/sync` y motor de proyecciones financieras.
- **Android TWA (Trusted Web Activity)**: Proyecto Android Gradle (`android-twa/`) con `com.google.androidbrowserhelper` y enlace verificado mediante Digital Asset Links (`/.well-known/assetlinks.json`).

---

## 📊 Mapeo del Modelo Financiero

| Sección | Mecánica | Función en la Aplicación |
| :--- | :--- | :--- |
| **Billeteras Líquidas** | Wallets con sumas de transacciones | Tarjetas de billetera con saldo disponible en tiempo real y libro diario de ingresos, gastos y transferencias. |
| **Patrimonio e Inversiones** | Inversiones, capital con rendimiento % EA y activos | Sección de Patrimonio separada del dinero de gasto diario para calcular el Patrimonio Neto real. |
| **Cobros Pendientes y Arriendos** | Cobros por día del mes con deducciones | Lista de cobros por día del mes con deducciones automáticas y botón **"Cobrar en Billetera"** en 1 toque. |
| **Egresos Recurrentes** | Facturas y servicios del mes | Control de presupuesto mensual vs. saldo pendiente con botón **"Pagar con Billetera"** en 1 toque. |
| **Extras del Mes** | Movimientos variables con factor neto | Registro de ingresos y gastos variables con factor neto y estado liquidado/pendiente. |
| **Proyecciones de Dinero** | Restante, Pendiente, Incl. Pendientes | Indicadores en vivo + Disponibilidad a **Fin de Semana**, **Fin de Mes** y **Fin de Año**. |
| **Metas de Ahorro** | Metas con objetivo y progreso | Barras de progreso, monto actual y botón para aportar dinero directamente desde cualquier billetera. |

---

## 🛠️ Instalación y Desarrollo Local

### Requisitos
- **Node.js**: v18 o superior (v20+ recomendado).
- **Go**: v1.22 o superior (opcional, para el backend en Go).
- **Java JDK**: 17 o 21 (para generar keystores y compilar el APK de Android).

### 1. Frontend (Next.js)
```powershell
cd frontend
npm install
npm run dev
```
Abre en tu navegador: [http://localhost:3000](http://localhost:3000)

Para ejecutar pruebas unitarias:
```powershell
npm test
```

Para generar la compilación de producción:
```powershell
npm run build
```

### 2. Backend en Golang
```powershell
cd backend
go test -v ./...
go run ./cmd/api
```
El servidor REST iniciará en el puerto `8080`.

---

## ☁️ Configuración de Supabase

1. En tu consola de Supabase ([supabase.com](https://supabase.com)), abre el **SQL Editor** de tu proyecto.
2. Ejecuta el archivo de migración ubicado en `supabase/migrations/001_initial_schema.sql`.
3. Configura tus variables de entorno en `.env.local` usando `.env.example` como plantilla:
```env
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here
SUPABASE_SECRET_KEY=your-secret-key-here
SUPABASE_JWKS_URL=https://your-project-id.supabase.co/auth/v1/.well-known/jwks.json
```

---

## 🌐 Despliegue en Vercel

1. Importa tu repositorio en [Vercel](https://vercel.com).
2. Configura:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
3. Agrega las variables de entorno de tu propio proyecto de Supabase.
4. Despliega en tu dominio asignado (por ejemplo, `https://your-domain.vercel.app`).

---

## 📱 Compilación del APK para Android (TWA)

1. El proyecto Android nativo con soporte TWA se encuentra en `android-twa/`.
2. Para compilar y firmar el APK apuntando a tu dominio de producción:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -AppUrl "https://your-domain.vercel.app"
```
3. La huella digital SHA-256 se genera y sincroniza automáticamente en `frontend/public/.well-known/assetlinks.json`.
4. Al instalar el APK en tu dispositivo Android, una vez que tu dominio esté en línea con el archivo `assetlinks.json`, la app se abrirá en pantalla completa sin barra de navegación del navegador, como una app nativa instalada.

---

## 📄 Licencia
Privado / Personal. Desarrollado para gestión financiera personal de alta precisión.
