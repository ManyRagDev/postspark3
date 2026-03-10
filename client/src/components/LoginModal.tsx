import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, Eye, EyeOff, Loader2, Chrome } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';

interface LoginModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

type AuthMode = 'login' | 'register';

async function exchangeSupabaseSession(access_token: string): Promise<void> {
    const res = await fetch('/api/auth/supabase-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ access_token }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao criar sessão');
    }
}

export default function LoginModal({ open, onClose, onSuccess }: LoginModalProps) {
    const [mode, setMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = useCallback(() => {
        setEmail('');
        setPassword('');
        setError(null);
        setLoading(false);
        setGoogleLoading(false);
    }, []);

    const handleClose = useCallback(() => {
        reset();
        onClose();
    }, [reset, onClose]);

    const handleEmailAuth = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (!isSupabaseConfigured || !supabase) {
                throw new Error('Login indisponivel: configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY na Vercel.');
            }

            let result;

            if (mode === 'login') {
                result = await supabase.auth.signInWithPassword({ email, password });
            } else {
                result = await supabase.auth.signUp({ email, password });
            }

            if (result.error) throw result.error;

            const access_token = result.data.session?.access_token;
            if (!access_token) {
                if (mode === 'register') {
                    setError('Conta criada! Verifique seu e-mail para confirmar o cadastro.');
                    return;
                }
                throw new Error('Sessão não encontrada');
            }

            await exchangeSupabaseSession(access_token);
            reset();
            onSuccess?.();
            onClose();
            window.location.reload(); // Força refresh para o useAuth pegar o novo cookie
        } catch (err: any) {
            const msg = err?.message || 'Ocorreu um erro. Tente novamente.';
            if (msg.includes('Invalid login credentials')) {
                setError('E-mail ou senha incorretos.');
            } else if (msg.includes('User already registered')) {
                setError('Este e-mail já está cadastrado. Faça login.');
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    }, [mode, email, password, reset, onSuccess, onClose]);

    const handleGoogleSSO = useCallback(async () => {
        setGoogleLoading(true);
        setError(null);

        try {
            if (!isSupabaseConfigured || !supabase) {
                throw new Error('Login com Google indisponivel: configure as variaveis publicas do Supabase na Vercel.');
            }

            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/google-callback`,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                },
            });
            if (error) throw error;
            // Redirecionamento acontece automaticamente
        } catch (err: any) {
            setError(err?.message || 'Falha ao iniciar login com Google.');
            setGoogleLoading(false);
        }
    }, []);


    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 z-50"
                        style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                    />

                    {/* Modal */}
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="relative w-full max-w-md rounded-2xl p-8 flex flex-col gap-6"
                            style={{
                                background: 'linear-gradient(145deg, oklch(0.1 0.05 280), oklch(0.07 0.03 260))',
                                border: '1px solid oklch(0.7 0.22 40 / 20%)',
                                boxShadow: '0 0 60px oklch(0.7 0.22 40 / 12%), 0 30px 80px oklch(0 0 0 / 60%)',
                            }}
                            initial={{ opacity: 0, scale: 0.92, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: 20 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Close */}
                            <button
                                onClick={handleClose}
                                className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors"
                                style={{ color: 'oklch(0.6 0 0)' }}
                            >
                                <X size={16} />
                            </button>

                            {/* Header */}
                            <div className="flex flex-col items-center gap-2 text-center">
                                <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold mb-1"
                                    style={{ background: 'oklch(0.7 0.22 40 / 15%)', border: '1px solid oklch(0.7 0.22 40 / 30%)' }}
                                >
                                    ✦
                                </div>
                                <h2 className="text-xl font-bold" style={{ color: 'oklch(0.95 0.01 280)' }}>
                                    {mode === 'login' ? 'Bem-vindo de volta' : 'Criar sua conta'}
                                </h2>
                                <p className="text-sm" style={{ color: 'oklch(0.6 0.02 280)' }}>
                                    {mode === 'login'
                                        ? 'Acesse sua conta PostSpark'
                                        : '50 Sparks grátis pra começar'}
                                </p>
                            </div>

                            {/* Google SSO */}
                            <button
                                onClick={handleGoogleSSO}
                                disabled={googleLoading || loading || !isSupabaseConfigured}
                                className="flex items-center justify-center gap-3 w-full py-3 px-4 rounded-xl font-medium text-sm transition-all"
                                style={{
                                    background: 'oklch(0.15 0.03 280)',
                                    border: '1px solid oklch(0.3 0.05 280)',
                                    color: 'oklch(0.9 0.01 280)',
                                }}
                            >
                                {googleLoading ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    <Chrome size={18} />
                                )}
                                {googleLoading ? 'Conectando...' : 'Continuar com Google'}
                            </button>

                            {/* Divider */}
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-px" style={{ background: 'oklch(0.25 0.03 280)' }} />
                                <span className="text-xs" style={{ color: 'oklch(0.45 0.02 280)' }}>ou com e-mail</span>
                                <div className="flex-1 h-px" style={{ background: 'oklch(0.25 0.03 280)' }} />
                            </div>

                            {/* Email form */}
                            <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
                                {/* Email */}
                                <div className="relative">
                                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'oklch(0.5 0.02 280)' }} />
                                    <input
                                        type="email"
                                        placeholder="seu@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                                        style={{
                                            background: 'oklch(0.13 0.03 280)',
                                            border: '1px solid oklch(0.25 0.04 280)',
                                            color: 'oklch(0.92 0.01 280)',
                                        }}
                                    />
                                </div>

                                {/* Password */}
                                <div className="relative">
                                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'oklch(0.5 0.02 280)' }} />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : 'Sua senha'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        className="w-full pl-10 pr-11 py-3 rounded-xl text-sm outline-none transition-all"
                                        style={{
                                            background: 'oklch(0.13 0.03 280)',
                                            border: '1px solid oklch(0.25 0.04 280)',
                                            color: 'oklch(0.92 0.01 280)',
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((v) => !v)}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2"
                                        style={{ color: 'oklch(0.5 0.02 280)' }}
                                    >
                                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>

                                {/* Error */}
                                {error && (
                                    <motion.p
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-xs px-3 py-2 rounded-lg"
                                        style={{ background: 'oklch(0.4 0.2 25 / 15%)', color: 'oklch(0.75 0.18 25)', border: '1px solid oklch(0.4 0.2 25 / 30%)' }}
                                    >
                                        {error}
                                    </motion.p>
                                )}

                                {!isSupabaseConfigured && (
                                    <p
                                        className="text-xs px-3 py-2 rounded-lg"
                                        style={{ background: 'oklch(0.4 0.2 25 / 15%)', color: 'oklch(0.85 0.08 85)', border: '1px solid oklch(0.55 0.12 85 / 30%)' }}
                                    >
                                        Login desabilitado ate configurar VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
                                    </p>
                                )}

                                {/* Submit */}
                                <motion.button
                                    type="submit"
                                    disabled={loading || googleLoading || !isSupabaseConfigured}
                                    className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all mt-1"
                                    style={{
                                        background: loading ? 'oklch(0.5 0.15 40)' : 'linear-gradient(135deg, oklch(0.7 0.22 40), oklch(0.6 0.2 20))',
                                        color: 'white',
                                        boxShadow: loading ? 'none' : '0 0 20px oklch(0.7 0.22 40 / 30%)',
                                    }}
                                    whileHover={!loading ? { scale: 1.02 } : {}}
                                    whileTap={!loading ? { scale: 0.98 } : {}}
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {loading
                                        ? 'Aguarde...'
                                        : mode === 'login'
                                            ? 'Entrar'
                                            : 'Criar conta grátis'}
                                </motion.button>
                            </form>

                            {/* Mode switch */}
                            <p className="text-center text-sm" style={{ color: 'oklch(0.55 0.02 280)' }}>
                                {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
                                <button
                                    onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
                                    className="font-semibold transition-colors"
                                    style={{ color: 'oklch(0.7 0.22 40)' }}
                                >
                                    {mode === 'login' ? 'Criar conta grátis' : 'Entrar'}
                                </button>
                            </p>

                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

