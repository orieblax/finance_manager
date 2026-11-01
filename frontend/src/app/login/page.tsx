'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, UserPlus, Lock, Mail, AlertCircle, CheckCircle2, ShieldCheck, Sparkles, AlertTriangle } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useApp } from '@/context/AppContext';
import { setActiveUserId } from '@/lib/db/dexie';
import { restoreFromCloud } from '@/lib/sync/cloudSync';

export default function LoginPage() {
  const router = useRouter();
  const { lang, setLang, showMessage } = useApp();
  const supabase = createClient();

  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder');

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      if (!isSupabaseConfigured) {
        throw new Error(
          lang === 'es'
            ? 'Faltan las variables de entorno de Supabase en Vercel (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY). Por favor agrégalas en Vercel Project Settings > Environment Variables y haz un Redeploy.'
            : 'Supabase environment variables are missing in Vercel (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY). Please add them in Vercel Project Settings > Environment Variables and redeploy.'
        );
      }

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;

        if (data.user && !data.session) {
          setInfoMessage(
            lang === 'es'
              ? 'Cuenta creada. Si la confirmación de correo está activada en Supabase, revisa tu bandeja de entrada para verificar tu cuenta antes de iniciar sesión.'
              : 'Account created. If email confirmation is enabled in Supabase, please check your inbox to confirm your account before logging in.'
          );
        } else {
          if (data.user) {
            setActiveUserId(data.user.id);
            try {
              await restoreFromCloud(undefined, data.user.id);
            } catch {}
          }
          showMessage(lang === 'es' ? '¡Bienvenido! Cuenta creada con éxito' : 'Welcome! Account created successfully', 'success');
          router.push('/');
          router.refresh();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        // Immediately hydrate local IndexedDB from Supabase snapshot
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          setActiveUserId(userData.user.id);
          try {
            await restoreFromCloud(undefined, userData.user.id);
          } catch {}
        }

        showMessage(lang === 'es' ? 'Sesión iniciada con éxito' : 'Signed in successfully', 'success');
        router.push('/');
        router.refresh();
      }
    } catch (err: any) {
      let msg = err.message || 'Error al procesar la solicitud';
      if (msg.includes('rate limit')) {
        msg =
          lang === 'es'
            ? 'Límite de envío de correos alcanzado en Supabase. En tu consola de Supabase ve a Authentication > Providers > Email y desactiva "Confirm email" para registro instantáneo.'
            : 'Email send rate limit reached on Supabase. Go to Supabase Console > Authentication > Providers > Email and disable "Confirm email" for instant signup.';
      } else if (msg.includes('Invalid login credentials')) {
        msg =
          lang === 'es'
            ? 'Credenciales incorrectas o correo pendiente de confirmación en tu bandeja de entrada.'
            : 'Invalid login credentials or email confirmation pending in your inbox.';
      }
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-dark flex flex-col justify-center items-center px-4 py-8">
      {/* Language switcher top right */}
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
          className="text-xs px-3 py-1.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-300 hover:text-white"
        >
          {lang === 'es' ? 'English' : 'Español'}
        </button>
      </div>

      <div className="max-w-md w-full space-y-6">
        {/* Brand Logo & Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center font-black text-xl text-white shadow-xl mx-auto">
            PFM
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Personal Finance Manager
          </h1>
          <p className="text-xs text-gray-400">
            {lang === 'es'
              ? 'Inicia sesión o crea una cuenta para acceder a tus finanzas personales y datos privados'
              : 'Sign in or create an account to access your personal finances and private data'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-5">
          {!isSupabaseConfigured && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {lang === 'es' ? 'Variables de Supabase Requeridas en Vercel' : 'Supabase Variables Required in Vercel'}
                </span>
              </div>
              <p className="leading-relaxed">
                {lang === 'es'
                  ? 'Para que el registro e inicio de sesión funcionen en Vercel, debes agregar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en Settings > Environment Variables y hacer Redeploy.'
                  : 'For signup and signin to work on Vercel, configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Settings > Environment Variables and trigger a Redeploy.'}
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="flex bg-gray-800/70 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(false);
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all ${
                !isSignUp ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {lang === 'es' ? 'Iniciar Sesión' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(true);
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all ${
                isSignUp ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {lang === 'es' ? 'Crear Cuenta' : 'Create Account'}
            </button>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{infoMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">
                {lang === 'es' ? 'Correo Electrónico' : 'Email Address'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ej. usuario@gmail.com"
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-800/80 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">
                {lang === 'es' ? 'Contraseña' : 'Password'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-800/80 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isSignUp ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>{lang === 'es' ? 'Registrarme' : 'Sign Up'}</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>{lang === 'es' ? 'Entrar a mis Finanzas' : 'Log In to My Finances'}</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-2 text-center">
            <p className="text-[11px] text-gray-500 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {lang === 'es'
                  ? 'Tus datos están protegidos y aislados por usuario'
                  : 'Your data is secured and isolated per user'}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
