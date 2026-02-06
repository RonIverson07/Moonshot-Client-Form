
import React, { useEffect, useRef, useState } from 'react';
import { FormData, EmailSettings } from '../types';
import { Logo, BUSINESS_NAME } from '../constants';
import { apiUrl, withAdminAuth } from '../api';

interface Props {
  submissions: FormData[];
  emailSettings: EmailSettings;
  onUpdateEmailSettings: (settings: EmailSettings) => Promise<boolean>;
  onDelete: (id: string) => void;
  onLogout: () => void;
}

const AdminDashboard: React.FC<Props> = ({ submissions, emailSettings, onUpdateEmailSettings, onDelete, onLogout }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [tempSettings, setTempSettings] = useState<EmailSettings>(emailSettings);
  const reportRef = useRef<HTMLDivElement | null>(null);
  
  const [adminEmail, setAdminEmail] = useState(emailSettings.supportEmail || 'it-support@moonshot.digital');
  const [adminPass, setAdminPass] = useState('');

  useEffect(() => {
    setTempSettings(emailSettings);
    setAdminEmail(emailSettings.supportEmail || 'it-support@moonshot.digital');
  }, [emailSettings]);

  const selected = submissions.find(s => s.id === selectedId);

  const blobToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || '');
        const comma = s.indexOf(',');
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      r.onerror = () => reject(r.error || new Error('Failed to read blob'));
      r.readAsDataURL(blob);
    });

  const safePdfName = (name: string) =>
    String(name || 'Lead')
      .trim()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'Lead';

  const exportToCSV = () => {
    if (submissions.length === 0) return;
    const fields = Object.keys(submissions[0]);
    const headers = fields.join(',');
    const rows = submissions.map(s => fields.map(f => `"${String((s as any)[f] || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moonshot_full_database_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handlePrint = () => window.print();

  const handleTestSmtp = async () => {
  // We only need the destination email now
  if (!tempSettings.notificationEmail) {
    alert("Please enter the Lead Destination Email before testing.");
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!adminEmail || !emailRegex.test(adminEmail)) {
    alert('Admin Email must be a valid email address.');
    return;
  }

  if (tempSettings.smtpHost && String(tempSettings.smtpHost).includes('@')) {
    alert('SMTP Host must be a server hostname like smtp.gmail.com (not an email address).');
    return;
  }

  setIsTestingSmtp(true);
  try {
    const saved = await onUpdateEmailSettings({
      ...tempSettings,
      supportEmail: adminEmail,
    });
    if (!saved) {
      alert('Could not save settings. Please double-check Admin Email and SMTP fields, then click Synchronize.');
      return;
    }

    let selectedPayload: any;

    const el = reportRef.current;
    if (selected && el) {
      const mod = await import('html2pdf.js');
      const html2pdf: any = (mod as any).default || (mod as any);
      const pdfBlob: Blob = await html2pdf()
        .from(el)
        .set({
          margin: [6, 6, 6, 6],
          filename: `Strategy-Brief-${safePdfName(String(selected.companyName || 'Lead'))}.pdf`,
          image: { type: 'jpeg', quality: 0.92 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .toPdf()
        .get('pdf')
        .then((pdf: any) => pdf.output('blob'));

      const pdfBase64 = await blobToBase64(pdfBlob);

      selectedPayload = {
        ...selected,
        notificationEmail: tempSettings.notificationEmail,
        attachment: {
          filename: `Strategy-Brief-${safePdfName(String(selected.companyName || 'Lead'))}.pdf`,
          contentType: 'application/pdf',
          contentBase64: pdfBase64,
        },
      };
    } else {
      selectedPayload = {
        notificationEmail: tempSettings.notificationEmail,
        companyName: 'SMTP Test',
        contactPerson: adminEmail,
        email: adminEmail,
        phoneNumber: '',
        submittedAt: new Date().toISOString(),
      };
    }

    const res = await fetch(
      apiUrl('/api/send-email'),
      withAdminAuth({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selectedPayload,
        }),
      })
    );

    const result = await res.json();

    if (result?.success) {
      alert("Success! Test email sent. Check inbox: " + tempSettings.notificationEmail);
    } else if (result?.result?.skipped) {
      alert("Email skipped by server. Reason: " + String(result.result.reason || 'unknown'));
    } else {
      const topError = String(result?.error || result?.result?.error || '').trim();
      const details = result?.details;
      const extra = details
        ? `\n\nDetails:\nmessage: ${String(details.message || '')}\ncode: ${String(details.code || '')}\nresponseCode: ${String(details.responseCode || '')}\ncommand: ${String(details.command || '')}`
        : '';
      alert("Email failed on server." + (topError ? `\n\nError: ${topError}` : '') + extra);
      console.error(result);
    }
  } catch (e) {
    alert("Failed to call your server email API (/api/send-email).");
    console.error(e);
  } finally {
    setIsTestingSmtp(false);
  }
};


  const saveSettings = async () => {
  if (tempSettings.isEnabled) {
    if (!tempSettings.notificationEmail) {
      alert("REQUIRED: Please fill in the Lead Destination Email.");
      return;
    }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!adminEmail || !emailRegex.test(adminEmail)) {
    alert('Admin Email must be a valid email address.');
    return;
  }

  if (tempSettings.smtpHost && String(tempSettings.smtpHost).includes('@')) {
    alert('SMTP Host must be a server hostname like smtp.gmail.com (not an email address).');
    return;
  }

  const nextSettings: EmailSettings = {
    ...tempSettings,
    supportEmail: adminEmail,
  };

  if (adminPass) {
    fetch(
      apiUrl('/api/admin/password'),
      withAdminAuth({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPass }),
      })
    )
      .then(r => (r.ok ? r.json() : null))
      .catch(() => {
        // ignore
      });
  }

  const ok = await onUpdateEmailSettings(nextSettings);
  if (!ok) {
    alert('Failed to save settings to server. Check Admin Email + SMTP fields and try again.');
    return;
  }
  setShowSettings(false);
  alert("System configuration synchronized.");
};


  const confirmDelete = () => {
    if (selectedId) {
      onDelete(selectedId);
      setSelectedId(null);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col text-slate-900 selection:bg-brand-green selection:text-white">
      <nav className="bg-white border-b border-slate-300 px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-50 no-print">
        <div className="flex items-center gap-4 md:gap-8">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 lg:hidden text-slate-600 hover:bg-slate-100 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
          </button>
          <Logo />
          <div className="h-6 w-px bg-slate-300 hidden lg:block" />
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] hidden lg:block">Command Center</span>
        </div>
        <div className="flex items-center gap-1 md:gap-3">
          <button onClick={() => setShowSettings(true)} className="p-2 text-slate-500 hover:text-brand-green hover:bg-slate-100 rounded-xl transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </button>
          <button onClick={exportToCSV} className="p-2 text-slate-500 hover:text-brand-green hover:bg-slate-100 rounded-xl transition-all" title="Export Full CSV">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          </button>
          <button onClick={onLogout} className="bg-brand-navy text-white px-3 md:px-5 py-2 rounded-xl text-[9px] md:text-[10px] font-black hover:bg-slate-800 transition-all uppercase tracking-widest whitespace-nowrap">Logout</button>
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden relative">
        <aside className={`fixed inset-y-0 left-0 z-40 w-full md:w-[360px] bg-white border-r border-slate-300 overflow-y-auto custom-scrollbar no-print transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}>
          <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Inquiry Pipeline</h3>
            <span className="bg-brand-green text-white text-[11px] px-2 py-0.5 rounded-full font-black">{submissions.length}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {submissions.map(s => (
              <button key={s.id} onClick={() => setSelectedId(s.id)} className={`w-full text-left p-6 transition-all hover:bg-slate-50 border-l-8 ${selectedId === s.id ? 'bg-slate-100 border-brand-green' : 'border-transparent'}`}>
                <div className="flex justify-between items-start mb-2">
                  <span className="font-black text-brand-navy tracking-tight uppercase text-sm">{s.companyName}</span>
                  <span className="text-[10px] text-slate-500 font-bold">{new Date(s.submittedAt).toLocaleDateString()}</span>
                </div>
                <div className="text-[12px] text-slate-700 font-bold">{s.contactPerson}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar bg-[#F1F5F9] print:bg-white print:p-0">
          {selected ? (
            <div className="max-w-5xl mx-auto space-y-8">
              <div className="flex gap-3 no-print">
                <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-4 bg-white border-2 border-slate-300 rounded-xl hover:bg-slate-50 font-black text-[10px] uppercase tracking-widest shadow-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                  Generate PDF Discovery Report
                </button>
                <button onClick={() => setShowDeleteConfirm(true)} className="p-4 bg-white border-2 border-slate-300 text-brand-pink rounded-xl shadow-sm"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
              </div>

              <div ref={reportRef} className="bg-white rounded-[2.5rem] p-8 md:p-20 space-y-20 border-2 border-slate-300 shadow-xl print:border-none print:p-0">
                {/* PDF Header */}
                <div className="flex justify-between items-start border-b-4 border-slate-900 pb-16">
                  <div className="space-y-6">
                    <span className="bg-brand-green text-white text-[10px] font-black px-4 py-1 rounded uppercase tracking-[0.3em]">Comprehensive Strategy Brief</span>
                    <h2 className="text-5xl md:text-6xl font-black text-brand-navy tracking-tighter uppercase leading-none">{selected.companyName}</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Analysis generated on {new Date(selected.submittedAt).toLocaleString()}</p>
                  </div>
                  <Logo />
                </div>

                {/* Section: Contact & Identity */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-20">
                  <ReportSection title="Project Foundation">
                    <DataBox label="Project Title" value={selected.projectTitle} />
                    <DataBox label="Project Type" value={selected.projectType} />
                    <DataBox label="Current Digital Footprint" value={selected.currentWebsite} />
                    <DataBox label="Asset Readiness" value={selected.provideAssets} />
                  </ReportSection>
                  <ReportSection title="Contact Intel">
                    <DataBox label="Lead Strategist" value={selected.contactPerson} />
                    <DataBox label="Official Email" value={selected.email} />
                    <DataBox label="Direct Line" value={selected.phoneNumber} />
                    <DataBox label="Base Location" value={selected.companyLocation} />
                  </ReportSection>
                </div>

                {/* Section: Core Narrative */}
                <div className="space-y-12">
                  <ReportSection title="Narrative Analysis">
                    <DataBox label="Primary Motivation" value={selected.projectExcitement} large />
                    <DataBox label="Company Background" value={selected.companyDescription} large />
                    <DataBox label="The Problem We are Solving" value={selected.reasonForNewSite} large />
                    <DataBox label="Internal Stakeholders" value={selected.mainContactAuthority} large />
                  </ReportSection>
                </div>

                {/* Section: Brand & Aesthetic */}
                <div className="space-y-12">
                  <ReportSection title="Aesthetic Identity">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                      <div className="p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Existing Logo</span>
                        <p className="font-black text-brand-navy uppercase">{selected.hasLogo}</p>
                      </div>
                      <div className="p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Logo Design Needed</span>
                        <p className="font-black text-brand-navy uppercase">{selected.designLogoForYou || 'N/A'}</p>
                      </div>
                      <div className="p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Marketing Roadmap</span>
                        <p className="font-black text-brand-navy uppercase">{selected.hasMarketingRoadmap}</p>
                      </div>
                    </div>
                    <DataBox label="Visitor Emotional Goal" value={selected.emotionalGoal} large />
                    <DataBox label="Color Palette & Mood" value={selected.colorPreferences} large />
                    <DataBox label="Industry Benchmarks (Inspiration)" value={selected.inspirationLinks} large />
                  </ReportSection>
                </div>

                {/* Section: Market Strategy */}
                <div className="space-y-12">
                  <ReportSection title="Commercial Strategy">
                    <DataBox label="Ideal Customer Persona" value={selected.targetMarket} large />
                    <DataBox label="Conversion Milestones" value={selected.visitorActions} large />
                    <DataBox label="Unique Value Proposition" value={selected.uniqueSellingPoint} large />
                    <DataBox label="Functional Requirements" value={selected.requestedFeatures?.join(', ') || 'Standard Build'} large />
                    <DataBox label="SEO Performance Keywords" value={selected.seoKeywords} large />
                  </ReportSection>
                </div>

                {/* Section: Logistics & Projection */}
                <div className="space-y-12">
                  <ReportSection title="Timeline & Logistics">
                    <DataBox label="Budget Capacity & Hard Deadline" value={selected.budgetDeadline} large />
                    <DataBox label="2-Year Growth Projection" value={selected.longTermProjection} large />
                    <DataBox label="Referral & Loyalty Strategy" value={selected.referralPlan} large />
                  </ReportSection>
                </div>

                {/* PDF Footer */}
                <div className="pt-20 border-t-2 border-slate-100 flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">
                  <span>© {new Date().getFullYear()} {BUSINESS_NAME} Inc.</span>
                  <span className="text-brand-green">Proprietary Strategic Intel</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-8">
              <div className="w-20 h-20 rounded-full border-4 border-dashed border-slate-300 flex items-center justify-center opacity-40">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              </div>
              <p className="font-black tracking-[0.4em] text-[12px] uppercase">Awaiting Lead Selection</p>
            </div>
          )}
        </main>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-navy/60 backdrop-blur-md overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl border-4 border-slate-200 my-8 overflow-hidden flex flex-col">
            <div className="p-8 border-b-2 border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-brand-navy tracking-tighter uppercase">Infrastructure</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Webmail & Security Config</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-brand-navy p-2"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>
            
            <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-6">
                <h4 className="text-[10px] font-black text-brand-green uppercase tracking-[0.2em] border-b pb-2">Master Credentials</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Admin Email</label>
                    <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Master Pass</label>
                    <input type="text" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" />
                  </div>
                </div>
              </div>

              <div className="space-y-6 pt-4">
                <h4 className="text-[10px] font-black text-brand-green uppercase tracking-[0.2em] border-b pb-2 flex justify-between items-center">
                  Webmail SMTP Relay
                  <button onClick={() => setTempSettings(prev => ({...prev, isEnabled: !prev.isEnabled}))} className={`w-10 h-5 rounded-full relative transition-all ${tempSettings.isEnabled ? 'bg-brand-green' : 'bg-slate-300'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${tempSettings.isEnabled ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                </h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">SMTP Host</label>
                      <input type="text" value={tempSettings.smtpHost} onChange={(e) => setTempSettings(prev => ({...prev, smtpHost: e.target.value}))} placeholder="smtp.moonshot.digital" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Port</label>
                      <input type="text" value={tempSettings.smtpPort} onChange={(e) => setTempSettings(prev => ({...prev, smtpPort: e.target.value}))} placeholder="465" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Webmail User</label>
                      <input type="text" value={tempSettings.smtpUser} onChange={(e) => setTempSettings(prev => ({...prev, smtpUser: e.target.value}))} placeholder="hello@moonshot.digital" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Webmail Pass</label>
                      <input type="password" value={tempSettings.smtpPass} onChange={(e) => setTempSettings(prev => ({...prev, smtpPass: e.target.value}))} placeholder="••••••••" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Lead Destination Email</label>
                    <input type="email" value={tempSettings.notificationEmail} onChange={(e) => setTempSettings(prev => ({...prev, notificationEmail: e.target.value}))} placeholder="leads@moonshot.digital" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm" />
                  </div>
                  <div className="pt-2">
                    <button 
                      onClick={handleTestSmtp}
                      disabled={isTestingSmtp}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[9px] uppercase tracking-widest rounded-lg border border-slate-200 transition-all disabled:opacity-50"
                    >
                      {isTestingSmtp ? (
                        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                      )}
                      Test SMTP Connection
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-8 bg-slate-50 flex gap-4">
              <button onClick={() => setShowSettings(false)} className="flex-1 px-4 py-4 font-black text-[10px] text-slate-500 uppercase tracking-widest">Cancel</button>
              <button onClick={saveSettings} className="flex-1 px-4 py-4 font-black bg-brand-green text-white rounded-xl shadow-lg shadow-brand-green/20 text-[10px] uppercase tracking-widest">Synchronize</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-brand-navy/80 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 text-center border-4 border-brand-pink shadow-2xl">
            <h3 className="text-2xl font-black text-brand-navy mb-4 uppercase">Confirm Delete</h3>
            <p className="text-slate-600 text-sm font-bold mb-10">Permanently purge record: <span className="text-brand-pink">{selected?.companyName}</span></p>
            <div className="flex flex-col gap-3">
              <button onClick={confirmDelete} className="w-full py-4 bg-brand-pink text-white rounded-xl font-black text-[10px] tracking-widest uppercase">Delete Forever</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="w-full py-4 text-slate-500 font-black text-[10px] tracking-widest uppercase">Abort</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ReportSection = ({ title, children }: any) => (
  <div className="space-y-8">
    <h4 className="text-[12px] font-black text-brand-green uppercase tracking-[0.4em] flex items-center gap-4">
      {title}
      <div className="flex-1 h-[2px] bg-slate-200" />
    </h4>
    <div className="space-y-10">{children}</div>
  </div>
);

const DataBox = ({ label, value, large }: any) => (
  <div className={`space-y-3 ${large ? 'bg-slate-50 p-8 rounded-3xl border-2 border-slate-200' : ''}`}>
    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{label}</span>
    <p className={`text-brand-navy leading-relaxed whitespace-pre-wrap ${large ? 'text-sm md:text-base font-bold' : 'text-base md:text-xl font-black tracking-tight uppercase'}`}>
      {value || <span className="text-slate-400 italic font-bold">Unreported Intelligence</span>}
    </p>
  </div>
);

export default AdminDashboard;
