
import React, { useEffect, useState } from 'react';
import { Logo } from '../constants';
import { apiUrl, setAdminToken } from '../api';

interface Props {
  onLoginSuccess: () => void;
}

const AdminLogin: React.FC<Props> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [view, setView] = useState<'login' | 'forgot' | 'reset'>('login');
  const [supportEmail, setSupportEmail] = useState('it-support@moonshot.digital');
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    const loadSupportEmail = async () => {
      try {
        const res = await fetch(apiUrl('/api/settings/public'));
        if (!res.ok) return;
        const data = await res.json();
        if (data?.supportEmail) setSupportEmail(data.supportEmail);
      } catch {
        // ignore
      }
    };
    loadSupportEmail();
  }, []);

  useEffect(() => {
    const applyHash = () => {
      const raw = String(window.location.hash || '');
      if (!raw.startsWith('#admin-reset')) return;
      const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
      const params = new URLSearchParams(query);
      const token = params.get('token') || '';
      setResetToken(token);
      setView('reset');
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await fetch(apiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        try {
          const data = await res.json();
          if (data?.token && typeof data.token === 'string') {
            setAdminToken(data.token);
          }
        } catch {
          // ignore
        }
        onLoginSuccess();
        return;
      }
    } catch {
      // ignore
    }

    setError(true);
    setTimeout(() => setError(false), 2000);
  };

  if (view === 'forgot') {
    const sendRecoveryEmail = async () => {
      setRecoveryError('');
      setRecoverySent(false);
      setIsSendingRecovery(true);
      try {
        const res = await fetch(apiUrl('/api/admin/password-reset/request'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          setRecoveryError(text || 'Failed to send recovery email.');
          return;
        }

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          // ignore
        }

        if (data && typeof data === 'object' && 'sent' in data) {
          if (data.sent === true) {
            setRecoverySent(true);
            return;
          }
          setRecoveryError('Email was not sent. Please check server relay configuration (EMAIL_RELAY_URL/EMAIL_RELAY_SECRET) and Support Email settings.');
          return;
        }

        setRecoveryError('Unexpected server response. Please check server logs.');
      } catch {
        setRecoveryError('Failed to send recovery email.');
      } finally {
        setIsSendingRecovery(false);
      }
    };

    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 md:p-6">
        <div className="max-w-md w-full bg-white p-8 md:p-12 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border border-slate-100 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-brand-navy opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-brand-navy mb-3 tracking-tighter uppercase">Access Recovery</h2>
          <div className="space-y-4 mb-8">
            <p className="text-slate-500 text-sm font-normal leading-relaxed">
              Master credentials are encrypted and managed by the system administrator.
            </p>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Support Contact</p>
              <p className="text-brand-navy font-bold text-sm">{supportEmail}</p>
            </div>
          </div>
          <div className="space-y-3 mb-4">
            <button
              onClick={sendRecoveryEmail}
              disabled={isSendingRecovery}
              className="w-full bg-brand-green text-white py-4 rounded-2xl font-black shadow-lg shadow-brand-green/20 hover:brightness-110 active:scale-95 transition-all uppercase text-[10px] tracking-[0.2em] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSendingRecovery ? 'Sending...' : 'Send Recovery Email'}
            </button>
            {recoverySent && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Reset link sent to support contact.
              </div>
            )}
            {!!recoveryError && (
              <div className="p-3 bg-brand-pink/10 rounded-xl border border-brand-pink/20 text-[10px] font-bold text-brand-pink uppercase tracking-widest">
                {recoveryError}
              </div>
            )}
          </div>
          <button 
            onClick={() => setView('login')}
            className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all uppercase text-[10px] tracking-widest"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (view === 'reset') {
    const submitReset = async (e: React.FormEvent) => {
      e.preventDefault();
      setResetError('');
      setResetSuccess(false);

      const token = String(resetToken || '').trim();
      if (!token) {
        setResetError('Missing reset token. Please use the link from your email again.');
        return;
      }
      if (!newPassword || newPassword.length < 8) {
        setResetError('Password must be at least 8 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setResetError('Passwords do not match.');
        return;
      }

      setIsResetting(true);
      try {
        const res = await fetch(apiUrl('/api/admin/password-reset/confirm'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword }),
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          // ignore
        }

        if (!res.ok || !data?.success) {
          setResetError(String(data?.error || 'Failed to reset password.'));
          return;
        }

        setResetSuccess(true);
        setNewPassword('');
        setConfirmPassword('');
      } catch {
        setResetError('Failed to reset password.');
      } finally {
        setIsResetting(false);
      }
    };

    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 md:p-6">
        <div className="max-w-md w-full bg-white p-8 md:p-12 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border border-slate-100 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-brand-navy opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 11V7a4 4 0 00-8 0v4m-2 0h12a2 2 0 012 2v7a2 2 0 01-2 2H6a2 2 0 01-2-2v-7a2 2 0 012-2z" />
            </svg>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-brand-navy mb-3 tracking-tighter uppercase">Reset Password</h2>
          <p className="text-slate-500 text-sm font-normal leading-relaxed mb-8">
            Set a new admin password.
          </p>

          <form onSubmit={submitReset} className="space-y-4 mb-4">
            <div className="text-left">
              <label className="text-[10px] font-bold text-brand-green uppercase tracking-[0.2em] ml-1 mb-3 block">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-brand-green focus:ring-4 focus:ring-brand-green/5 p-4 md:p-5 rounded-2xl text-slate-900 outline-none transition-all font-mono text-center tracking-widest"
                placeholder="••••••••"
              />
            </div>

            <div className="text-left">
              <label className="text-[10px] font-bold text-brand-green uppercase tracking-[0.2em] ml-1 mb-3 block">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-brand-green focus:ring-4 focus:ring-brand-green/5 p-4 md:p-5 rounded-2xl text-slate-900 outline-none transition-all font-mono text-center tracking-widest"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isResetting}
              className="w-full bg-brand-green text-white py-4 rounded-2xl font-black shadow-lg shadow-brand-green/20 hover:brightness-110 active:scale-95 transition-all uppercase text-[10px] tracking-[0.2em] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isResetting ? 'Resetting...' : 'Set New Password'}
            </button>
          </form>

          {resetSuccess && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">
              Password updated. You can now log in.
            </div>
          )}
          {!!resetError && (
            <div className="p-3 bg-brand-pink/10 rounded-xl border border-brand-pink/20 text-[10px] font-bold text-brand-pink uppercase tracking-widest mb-4">
              {resetError}
            </div>
          )}

          <button
            onClick={() => {
              window.location.hash = '#admin';
              setView('login');
            }}
            className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all uppercase text-[10px] tracking-widest"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 md:p-6">
      <div className="max-w-md w-full bg-white p-8 md:p-12 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border border-slate-100 text-center relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-center mb-10">
          <Logo />
        </div>
        <h2 className="text-xl md:text-2xl font-black text-brand-navy mb-2 tracking-tighter uppercase">Command Center</h2>
        <p className="text-slate-500 mb-10 text-xs md:text-sm font-normal uppercase tracking-widest opacity-60">Secure Authentication Required</p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="text-left">
            <label className="text-[10px] font-bold text-brand-green uppercase tracking-[0.2em] ml-1 mb-3 block">Access Key</label>
            <div className="relative">
               <input 
                type="password" 
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full bg-slate-50 border-2 ${error ? 'border-brand-pink ring-4 ring-brand-pink/5' : 'border-slate-100 focus:border-brand-green focus:ring-4 focus:ring-brand-green/5'} p-4 md:p-5 rounded-2xl text-slate-900 outline-none transition-all font-mono text-center tracking-widest`}
                placeholder="••••••••"
              />
            </div>
          </div>
          
          <button 
            type="submit"
            className="w-full bg-brand-green text-white py-4 md:py-5 rounded-2xl font-black shadow-lg shadow-brand-green/20 hover:brightness-110 active:scale-95 transition-all text-[10px] md:text-xs tracking-[0.2em] uppercase"
          >
            Authenticate
          </button>
        </form>
        
        <div className="mt-8 flex flex-col gap-4">
          <button 
            onClick={() => setView('forgot')}
            className="text-[9px] md:text-[10px] font-bold text-slate-400 hover:text-brand-navy transition-colors uppercase tracking-[0.2em]"
          >
            Forgot Password?
          </button>
          <div className="h-px w-8 bg-slate-100 mx-auto" />
          <button 
            onClick={() => window.location.hash = ''}
            className="text-[9px] md:text-[10px] font-bold text-slate-400 hover:text-brand-navy transition-colors uppercase tracking-[0.2em] flex items-center justify-center gap-2"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Public Site
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
