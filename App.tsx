
import React, { useState, useEffect } from 'react';
import ClientForm from './components/ClientForm';
import AdminDashboard from './components/AdminDashboard';
import AdminLogin from './components/AdminLogin';
import { FormData, EmailSettings } from './types';

const API_SUBMISSIONS_URL = '/api/submissions';

const normalizeEmailSettings = (raw: any): EmailSettings => {
  const supportEmail = typeof raw?.supportEmail === 'string' ? raw.supportEmail : 'it-support@moonshot.digital';
  return {
    supportEmail,
    notificationEmail: typeof raw?.notificationEmail === 'string' ? raw.notificationEmail : '',
    isEnabled: !!raw?.isEnabled,
    smtpHost: typeof raw?.smtpHost === 'string' ? raw.smtpHost : '',
    smtpPort: typeof raw?.smtpPort === 'string' ? raw.smtpPort : '465',
    smtpUser: typeof raw?.smtpUser === 'string' ? raw.smtpUser : '',
    smtpPass: typeof raw?.smtpPass === 'string' ? raw.smtpPass : '',
    useSSL: raw?.useSSL !== false,
    webhookUrl: typeof raw?.webhookUrl === 'string' ? raw.webhookUrl : undefined,
  };
};

const App: React.FC = () => {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [submissions, setSubmissions] = useState<FormData[]>([]);
  const [emailSettings, setEmailSettings] = useState<EmailSettings>({
    supportEmail: 'it-support@moonshot.digital',
    notificationEmail: '',
    isEnabled: false,
    smtpHost: '',
    smtpPort: '465',
    smtpUser: '',
    smtpPass: '',
    useSSL: true
  });

  useEffect(() => {
    const checkHash = () => setIsAdminMode(window.location.hash === '#admin');
    window.addEventListener('hashchange', checkHash);
    checkHash();
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  useEffect(() => {
    if (!isAdminMode) return;

    const bootstrapAdmin = async () => {
      try {
        const res = await fetch('/api/admin/me', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to check session');
        const data = await res.json();
        const authed = !!data?.authenticated;
        setIsAuthenticated(authed);

        if (authed) {
          const settingsRes = await fetch('/api/settings', { credentials: 'include' });
          if (settingsRes.ok) {
            const s = await settingsRes.json();
            setEmailSettings(normalizeEmailSettings(s));
          }

          const submissionsRes = await fetch(API_SUBMISSIONS_URL, { credentials: 'include' });
          if (submissionsRes.ok) {
            const subData = await submissionsRes.json();
            setSubmissions(subData?.submissions || []);
          }
        }
      } catch {
        setIsAuthenticated(false);
      }
    };

    bootstrapAdmin();
  }, [isAdminMode]);

  const handleNewSubmission = async (data: FormData) => {
    let savedSubmission = data;

    try {
      const res = await fetch(API_SUBMISSIONS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const result = await res.json();
        if (result?.submission) savedSubmission = result.submission;
      }
    } catch {
      // ignore
    }

    if (isAdminMode && isAuthenticated) {
      const updated = [savedSubmission, ...submissions];
      setSubmissions(updated);
    }

  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);

    fetch('/api/settings', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(s => {
        if (s) setEmailSettings(normalizeEmailSettings(s));
      })
      .catch(() => {
        // ignore
      });

    fetch(API_SUBMISSIONS_URL, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(s => {
        if (s?.submissions) setSubmissions(s.submissions);
      })
      .catch(() => {
        // ignore
      });
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }).catch(() => {
      // ignore
    });
    window.location.hash = '';
  };

  const updateEmailSettings = async (settings: EmailSettings): Promise<boolean> => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          supportEmail: settings.supportEmail || 'it-support@moonshot.digital',
          notificationEmail: settings.notificationEmail || '',
          isEnabled: !!settings.isEnabled,
          smtpHost: settings.smtpHost || '',
          smtpPort: settings.smtpPort || '465',
          smtpUser: settings.smtpUser || '',
          smtpPass: settings.smtpPass || '',
          useSSL: settings.useSSL !== false,
        }),
      });

      if (!res.ok) return false;
      setEmailSettings(normalizeEmailSettings(settings));
      return true;
    } catch {
      // ignore
      return false;
    }
  };

  const deleteSubmission = (id: string) => {
    fetch(`${API_SUBMISSIONS_URL}/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {
      // ignore
    });

    const updated = submissions.filter(s => s.id !== id);
    setSubmissions(updated);
  };

  if (isAdminMode) {
    if (!isAuthenticated) return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
    return (
      <AdminDashboard 
        submissions={submissions} 
        emailSettings={emailSettings}
        onUpdateEmailSettings={updateEmailSettings}
        onDelete={deleteSubmission}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <ClientForm onSubmit={handleNewSubmission} />
      <button 
        onClick={() => window.location.hash = 'admin'}
        className="fixed bottom-4 right-4 w-2 h-2 rounded-full opacity-0 hover:opacity-20 bg-slate-400 z-50"
      />
    </div>
  );
};

export default App;
