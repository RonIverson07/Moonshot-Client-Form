
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

  const moonshotLogoSvg = `<svg width="539" height="143" viewBox="0 0 539 143" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M252.881 34.1244V57.9094H242.236V37.2663C242.236 33.3367 239.684 30.6952 235.745 30.6952C231.807 30.6952 228.819 33.4107 228.819 37.4084V57.9094H218.174V37.2663C218.174 33.3367 215.622 30.6952 211.683 30.6952C207.745 30.6952 204.757 33.4107 204.757 37.4084V57.9094H194.112V21.4827H204.757V24.9829C207.454 22.1253 211.028 20.6268 215.329 20.6268C220.361 20.6268 224.371 22.6997 226.703 26.2681C229.694 22.5546 233.923 20.6268 239.097 20.6268C247.481 20.6268 252.878 25.9838 252.878 34.1273L252.881 34.1244Z" fill="#262626"/><path d="M258.494 39.6975C258.494 28.8414 267.098 20.6268 278.547 20.6268C289.995 20.6268 298.599 28.8414 298.599 39.6975C298.599 50.5536 289.995 58.7682 278.547 58.7682C267.098 58.7682 258.494 50.5536 258.494 39.6975ZM287.66 39.6975C287.66 34.5538 283.795 30.6982 278.547 30.6982C273.298 30.6982 269.433 34.5567 269.433 39.6975C269.433 44.8383 273.298 48.6969 278.547 48.6969C283.795 48.6969 287.66 44.8383 287.66 39.6975Z" fill="#262626"/><path d="M302.68 39.6975C302.68 28.8414 311.283 20.6268 322.732 20.6268C334.18 20.6268 342.784 28.8414 342.784 39.6975C342.784 50.5536 334.18 58.7682 322.732 58.7682C311.283 58.7682 302.68 50.5536 302.68 39.6975ZM331.845 39.6975C331.845 34.5538 327.981 30.6982 322.732 30.6982C317.483 30.6982 313.619 34.5567 313.619 39.6975C313.619 44.8383 317.483 48.6969 322.732 48.6969C327.981 48.6969 331.845 44.8383 331.845 39.6975Z" fill="#262626"/><path d="M385.218 34.4827V57.9094H374.572V37.98C374.572 33.5499 371.727 30.6952 367.353 30.6952C362.979 30.6952 359.698 33.6239 359.698 38.1221V57.9065H349.052V21.4797H359.698V25.1221C362.614 22.1934 366.407 20.6209 371.001 20.6209C379.531 20.6209 385.218 26.12 385.218 34.4768V34.4827Z" fill="#262626"/><path d="M390.176 53.2691L395.134 46.5529C397.979 48.9101 401.479 50.4825 405.78 50.4825C409.28 50.4825 411.686 49.4816 411.686 47.5538C411.686 45.4809 408.844 44.7672 405.051 43.9114C399.144 42.6262 391.344 40.9116 391.344 32.3417C391.344 24.4854 398.344 20.6268 406.802 20.6268C413.364 20.6268 418.103 22.913 421.603 25.4123L416.645 32.1255C413.874 30.2688 410.812 28.9125 407.167 28.9125C404.325 28.9125 401.989 29.6973 401.989 31.554C401.989 33.6269 404.834 34.2695 408.625 35.0542C414.457 36.2684 422.332 38.054 422.332 46.5529C422.332 54.5543 415.186 58.7682 406.144 58.7682C399.073 58.7682 393.821 56.1978 390.176 53.2691Z" fill="#262626"/><path d="M464.253 34.4827V57.9094H453.607V37.98C453.607 33.5499 450.762 30.6952 446.462 30.6952C441.868 30.6952 438.733 33.6239 438.733 38.1221V57.9065H428.087V6.47783H438.733V25.3353C441.649 22.2644 445.442 20.6209 450.036 20.6209C458.566 20.6209 464.253 26.12 464.253 34.4768V34.4827Z" fill="#262626"/><path d="M469.869 39.6975C469.869 28.8414 478.473 20.6268 489.921 20.6268C501.37 20.6268 509.973 28.8414 509.973 39.6975C509.973 50.5536 501.37 58.7682 489.921 58.7682C478.473 58.7682 469.869 50.5536 469.869 39.6975ZM499.034 39.6975C499.034 34.5538 495.17 30.6982 489.921 30.6982C484.673 30.6982 480.808 34.5567 480.808 39.6975C480.808 44.8383 484.673 48.6969 489.921 48.6969C495.17 48.6969 499.034 44.8383 499.034 39.6975Z" fill="#262626"/><path d="M528.781 30.9825V44.3408C528.781 47.1274 530.313 48.6969 533.449 48.6969C535.345 48.6969 536.949 48.1253 538.333 47.4117V57.1987C536.145 58.2707 534.029 58.7712 531.187 58.7712C522.145 58.7712 518.135 53.5563 518.135 46.0584V30.9884H512.522V21.4886H518.135V12.4892H528.781V21.4886H538.333V30.9884H528.781V30.9825Z" fill="#262626"/><path d="M231.881 77.1933V128.622H221.235V124.98C218.39 127.837 214.526 129.481 210.006 129.481C199.799 129.481 192.07 121.266 192.07 110.41C192.07 99.554 199.799 91.3394 210.006 91.3394C214.526 91.3394 218.39 92.9829 221.235 95.8405V77.1992H231.881V77.1933ZM221.235 110.407C221.235 105.263 217.371 101.408 212.122 101.408C206.873 101.408 203.08 105.266 203.08 110.407C203.08 115.548 206.944 119.406 212.122 119.406C217.3 119.406 221.235 115.548 221.235 110.407Z" fill="#262626"/><path d="M239.1 81.12C239.1 77.4776 241.942 74.7621 245.662 74.7621C249.381 74.7621 252.297 77.4746 252.297 81.12C252.297 84.7653 249.452 87.5489 245.662 87.5489C241.871 87.5489 239.1 84.8364 239.1 81.12ZM240.339 92.1922H250.985V128.619H240.339V92.1922Z" fill="#262626"/><path d="M297.357 139.333L286.421 142.262C286.131 139.904 284.089 138.332 281.098 138.332H269.504C262.285 138.332 257.546 134.26 257.546 128.19C257.546 124.331 259.514 120.618 262.649 118.761C259.588 115.903 257.765 111.903 257.765 107.404C257.765 98.1918 265.275 91.3334 275.337 91.3334C278.182 91.3334 280.805 91.905 283.14 92.8318C284.234 88.9022 287.953 86.4029 293.057 86.4029H296.192V96.0448H293.566C291.818 96.0448 290.431 96.9006 290.066 98.2599C291.889 100.83 292.983 103.901 292.983 107.401C292.983 116.617 285.399 123.472 275.337 123.472C273.44 123.472 271.618 123.259 269.869 122.759C268.775 123.472 268.192 124.473 268.192 125.545C268.192 127.189 269.576 128.258 271.546 128.258H283.14C290.65 128.258 295.973 132.329 297.357 139.33V139.333ZM268.701 107.404C268.701 110.976 271.546 113.62 275.337 113.62C279.127 113.62 282.047 110.979 282.047 107.404C282.047 103.83 279.13 101.192 275.337 101.192C271.543 101.192 268.701 103.833 268.701 107.404Z" fill="#262626"/><path d="M299.396 81.12C299.396 77.4776 302.238 74.7621 305.958 74.7621C309.677 74.7621 312.593 77.4746 312.593 81.12C312.593 84.7653 309.748 87.5489 305.958 87.5489C302.167 87.5489 299.396 84.8364 299.396 81.12ZM300.635 92.1922H311.28V128.619H300.635V92.1922Z" fill="#262626"/><path d="M333.665 101.692V115.05C333.665 117.837 335.197 119.406 338.333 119.406C340.229 119.406 341.833 118.835 343.217 118.121V127.908C341.03 128.98 338.913 129.481 336.071 129.481C327.029 129.481 323.019 124.266 323.019 116.768V101.698H317.406V92.1981H323.019V83.1988H333.665V92.1981H343.217V101.698H333.665V101.692Z" fill="#262626"/><path d="M386.602 92.1922V128.619H375.956V124.977C373.111 127.834 369.247 129.478 364.727 129.478C354.52 129.478 346.791 121.263 346.791 110.41C346.791 99.551 354.52 91.3364 364.727 91.3364C369.247 91.3364 373.111 92.9829 375.956 95.8376V92.1952H386.602V92.1922ZM375.956 110.407C375.956 105.263 372.092 101.408 366.843 101.408C361.594 101.408 357.801 105.266 357.801 110.407C357.801 115.548 361.666 119.406 366.843 119.406C372.021 119.406 375.956 115.548 375.956 110.407Z" fill="#262626"/><path d="M395.057 77.1933H405.703V128.622H395.057V77.1933Z" fill="#262626"/><path d="M104.757 25.3827L58.2663 71.8363L35.4579 94.6264V94.6323L15.2072 114.867L12.2139 117.858C8.55374 121.515 2.28559 119.854 0.937124 114.852C0.922306 114.802 0.907485 114.76 0.901557 114.71C0.279188 112.376 0.937124 109.892 2.64123 108.189L26.1875 84.6617L35.2712 75.5794L48.9959 61.8657L76.6114 34.2725C78.6385 32.2469 76.8336 28.8118 74.0181 29.3419C64.9197 31.0535 56.2243 35.4125 49.1945 42.4338L32.7313 58.8837C29.4298 62.1826 23.9767 58.6409 25.6393 54.273C28.6207 46.4492 33.2618 39.1201 39.5715 32.8125C49.8791 22.5043 62.9607 16.6498 76.4217 15.2255C82.5535 14.5799 88.7653 14.8612 94.832 16.0635C97.6534 16.6143 100.448 17.3724 103.184 18.3319C106.141 19.3713 106.965 23.1706 104.751 25.3827H104.757Z" fill="#14CD5E"/><path d="M143.798 82.5443C142.378 95.9945 136.513 109.057 126.196 119.365C122.062 123.502 117.477 126.925 112.599 129.629C106.776 132.857 101.038 125.276 105.744 120.567L116.576 109.744C125.731 100.596 130.372 88.6209 130.503 76.604L83.4011 123.659L79.8121 127.251C73.7099 133.342 64.4099 135.089 56.6155 131.397C56.571 131.376 56.5236 131.346 56.4792 131.326C52.33 129.35 48.3558 126.875 44.6601 123.911C42.9056 122.507 41.2074 120.991 39.5803 119.365C38.2615 118.047 37.5977 116.3 37.5977 114.556C37.5977 112.812 38.2645 111.07 39.5803 109.747L119.928 29.4722L124.226 25.1843L124.347 25.0629L130.277 19.1284C132.719 16.6883 136.602 16.4663 139.311 18.6073C141.024 19.9517 141.898 21.9417 141.898 23.9405C141.898 25.6729 141.24 27.4112 139.9 28.7497L126.828 41.8119H126.822L120.645 47.9832L58.2514 110.336C56.1739 112.418 56.6185 115.912 59.1672 117.378C60.2045 117.973 61.2655 118.524 62.3324 119.039C64.9315 120.277 68.0286 119.791 70.0676 117.751L127.755 60.1156L132.799 55.0755C135.434 52.4399 139.948 53.5001 141.11 57.0447C141.868 59.3782 142.491 61.7532 142.965 64.1459C144.168 70.2076 144.447 76.4204 143.795 82.5503L143.798 82.5443Z" fill="#14CD5E"/><path d="M154.01 30.3695C152.389 31.9893 150.528 33.233 148.545 34.0948C152.389 27.346 151.429 18.6043 145.668 12.8476C140.378 7.56167 132.568 6.32089 126.099 9.12523C126.866 7.77784 127.826 6.50745 128.976 5.35551C135.891 -1.55317 147.099 -1.55317 154.01 5.35551C160.925 12.2642 160.925 23.4638 154.01 30.3724V30.3695Z" fill="#14CD5E"/></svg>`;
  const moonshotLogoDataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(moonshotLogoSvg)))}`;

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

  const handleGeneratePdf = async () => {
    if (!selected) {
      alert('Select a lead from the list first.');
      return;
    }

    const el = reportRef.current;
    if (!el) {
      alert('PDF view is not ready yet. Please close and reopen the lead, then try again.');
      return;
    }

    try {
      const mod = await import('html2pdf.js');
      const html2pdf: any = (mod as any).default || (mod as any);

      try {
        const fontsAny: any = (document as any).fonts;
        if (fontsAny && typeof fontsAny.ready?.then === 'function') {
          await fontsAny.ready;
        }

        const captureWidth = Math.ceil(Math.max(el.scrollWidth, el.getBoundingClientRect().width));
        const captureHeight = Math.ceil(Math.max(el.scrollHeight, el.getBoundingClientRect().height));
        await html2pdf()
          .from(el)
          .set({
            margin: [6, 6, 6, 6],
            filename: `Strategy-Brief-${safePdfName(String(selected.companyName || 'Lead'))}.pdf`,
            image: { type: 'jpeg', quality: 0.92 },
            pagebreak: { mode: ['css', 'legacy'], avoid: ['.pdf-avoid-break'] },
            html2canvas: {
              scale: 2,
              useCORS: true,
              backgroundColor: '#ffffff',
              scrollX: 0,
              scrollY: 0,
              windowWidth: captureWidth,
              windowHeight: captureHeight,
              onclone: (clonedDoc: Document) => {
                const clonedEl = clonedDoc.getElementById(el.id) as HTMLElement | null;
                const scope = clonedEl || clonedDoc;

                if (clonedEl) {
                  clonedEl.style.boxSizing = 'border-box';
                  clonedEl.style.paddingTop = '18px';
                }

                try {
                  const styleEl = clonedDoc.createElement('style');
                  styleEl.setAttribute('data-pdf-wrap-fix', 'true');
                  styleEl.textContent = `
                    #${CSS.escape(el.id)} * { box-sizing: border-box !important; }
                    #${CSS.escape(el.id)} .grid > * { min-width: 0 !important; }
                    #${CSS.escape(el.id)} span.bg-brand-green {
                      display: inline-flex !important;
                      align-items: center !important;
                      justify-content: center !important;
                      text-align: center !important;
                      white-space: nowrap !important;
                      padding: 0 18px !important;
                      height: 32px !important;
                      min-height: 32px !important;
                      line-height: 1 !important;
                    }
                    #${CSS.escape(el.id)} .bg-slate-50.border-2.border-slate-200.rounded-3xl {
                      display: flex !important;
                      flex-direction: column !important;
                      justify-content: center !important;
                    }
                    #${CSS.escape(el.id)} .bg-slate-50.border-2.border-slate-100.rounded-3xl {
                      display: flex !important;
                      flex-direction: column !important;
                      justify-content: center !important;
                    }
                    #${CSS.escape(el.id)} p.text-brand-navy {
                      white-space: normal !important;
                      overflow-wrap: anywhere !important;
                      word-break: break-word !important;
                      max-width: 100% !important;
                    }
                  `;
                  clonedDoc.head.appendChild(styleEl);
                } catch {
                  // ignore
                }

                const badge = (scope as any).querySelector?.('span.bg-brand-green') as HTMLElement | null;
                if (badge) {
                  badge.setAttribute('style', 'display: inline-flex !important; align-items: center !important; justify-content: center !important; text-align: center !important; white-space: nowrap !important; background-color: #13C15B !important; color: white !important; font-weight: 900 !important; text-transform: uppercase !important; letter-spacing: 0.3em !important; border-radius: 6px !important; line-height: 1 !important; margin-top: 20px !important; padding: 0 18px !important; font-size: 13px !important; height: 32px !important; min-height: 32px !important; width: auto !important; position: relative !important; z-index: 10 !important;');
                } else {
                  const spans = (scope as any).querySelectorAll?.('span') as NodeListOf<HTMLElement> | undefined;
                  const byText = Array.from(spans || []).find(s =>
                    String(s.textContent || '').trim().toLowerCase().includes('comprehensive strategy brief')
                  );
                  if (byText) {
                    byText.setAttribute('style', 'display: inline-flex !important; align-items: center !important; justify-content: center !important; text-align: center !important; white-space: nowrap !important; background-color: #13C15B !important; color: white !important; font-weight: 900 !important; text-transform: uppercase !important; letter-spacing: 0.3em !important; border-radius: 6px !important; line-height: 1 !important; margin-top: 20px !important; padding: 0 18px !important; font-size: 13px !important; height: 32px !important; min-height: 32px !important; width: auto !important; position: relative !important; z-index: 10 !important;');
                  }
                }

                const logos = (scope as any).querySelectorAll?.('img') as NodeListOf<HTMLImageElement> | undefined;
                logos?.forEach(img => {
                  const src = String(img.getAttribute('src') || '');
                  const alt = String(img.getAttribute('alt') || '');
                  const looksLikeMoonshotLogo =
                    /moonshot\s*digital/i.test(alt) ||
                    /logo\.svg/i.test(src) ||
                    /moonshotdigital/i.test(src) ||
                    /moonshotdigital\.com\.ph/i.test(src);

                  if (looksLikeMoonshotLogo) {
                    const parent = img.parentElement as HTMLElement | null;
                    if (parent) {
                      parent.innerHTML = '';
                      parent.style.display = 'flex';
                      parent.style.alignItems = 'center';
                      parent.style.justifyContent = 'flex-end';

                      const logoImg = clonedDoc.createElement('img');
                      logoImg.src = moonshotLogoDataUri;
                      logoImg.alt = alt || 'Moonshot Digital Logo';
                      logoImg.style.width = '200px';
                      logoImg.style.height = '52px';
                      logoImg.style.objectFit = 'contain';
                      logoImg.style.display = 'block';
                      (logoImg as any).crossOrigin = 'anonymous';
                      parent.appendChild(logoImg);
                    } else {
                      img.src = moonshotLogoDataUri;
                    }
                  }
                });

                try {
                  const logoMount = (scope as any).querySelector?.('[data-pdf-logo]') as HTMLElement | null;
                  if (logoMount) {
                    logoMount.innerHTML = '';
                    logoMount.style.display = 'flex';
                    logoMount.style.alignItems = 'center';
                    logoMount.style.justifyContent = 'flex-end';

                    const logoImg = clonedDoc.createElement('img');
                    logoImg.src = moonshotLogoDataUri;
                    logoImg.alt = 'Moonshot Digital Logo';
                    logoImg.style.width = '200px';
                    logoImg.style.height = '52px';
                    logoImg.style.objectFit = 'contain';
                    logoImg.style.display = 'block';
                    (logoImg as any).crossOrigin = 'anonymous';
                    logoMount.appendChild(logoImg);
                  }

                  const header = (scope as any).querySelector?.('.flex.justify-between.items-start') as HTMLElement | null;
                  if (header) {
                    const right = header.lastElementChild as HTMLElement | null;
                    if (right) {
                      right.innerHTML = '';
                      right.style.display = 'flex';
                      right.style.alignItems = 'center';
                      right.style.justifyContent = 'flex-end';

                      const logoImg = clonedDoc.createElement('img');
                      logoImg.src = moonshotLogoDataUri;
                      logoImg.alt = 'Moonshot Digital Logo';
                      logoImg.style.width = '200px';
                      logoImg.style.height = '52px';
                      logoImg.style.objectFit = 'contain';
                      logoImg.style.display = 'block';
                      (logoImg as any).crossOrigin = 'anonymous';
                      right.appendChild(logoImg);
                    }
                  }
                } catch {
                  // ignore
                }

                const valuePs = (scope as any).querySelectorAll?.('p.text-brand-navy') as NodeListOf<HTMLElement> | undefined;
                valuePs?.forEach(p => {
                  p.style.whiteSpace = 'pre-wrap';
                  (p.style as any).overflowWrap = 'break-word';
                  (p.style as any).wordWrap = 'break-word';
                  (p.style as any).wordBreak = 'break-all';
                  p.style.maxWidth = '100%';
                  p.style.overflow = 'visible';
                  p.style.display = 'block';
                  p.style.width = '100%';
                  p.style.boxSizing = 'border-box';
                  p.style.paddingRight = '44px';
                  (p.style as any).paddingInlineEnd = '44px';
                  (p.style as any).maxWidth = 'calc(100% - 44px)';

                  const t = String(p.textContent || '').trim();
                  const escapeHtml = (s: string) =>
                    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                  if (t && t.includes('@')) {
                    const [before, ...rest] = t.split('@');
                    const after = rest.join('@');
                    p.innerHTML = `<span style="display:block; width:100%;">${escapeHtml(before)}@</span><span style="display:block; width:100%;">${escapeHtml(after)}</span>`;
                    p.style.whiteSpace = 'normal';
                    p.style.height = 'auto';
                    p.style.minHeight = '0px';
                    p.style.lineHeight = '1.15';
                  } else if (t && t.length > 20 && !/\s/.test(t)) {
                    const chunks = t.match(/.{1,15}/g) || [t];
                    p.innerHTML = chunks.map(escapeHtml).join('<br/>');
                    p.style.whiteSpace = 'normal';
                  }

                  let n: HTMLElement | null = p;
                  while (n && n !== (scope as any) && n !== (clonedEl as any) && n !== clonedDoc.body) {
                    try {
                      const cs = clonedDoc.defaultView?.getComputedStyle(n);
                      if (cs) {
                        if (cs.overflowX === 'hidden' || cs.overflowY === 'hidden' || cs.overflow === 'hidden') {
                          n.style.overflow = 'visible';
                          n.style.overflowX = 'visible';
                          n.style.overflowY = 'visible';
                        }
                        if (cs.whiteSpace === 'nowrap') {
                          n.style.whiteSpace = 'normal';
                        }
                      }
                      n.style.minWidth = '0px';
                      if (!n.style.maxWidth) n.style.maxWidth = '100%';
                    } catch {
                      // ignore
                    }
                    n = n.parentElement;
                  }
                });

                const labelSpans = (scope as any).querySelectorAll?.('span.text-slate-500.uppercase') as NodeListOf<HTMLElement> | undefined;
                labelSpans?.forEach(label => {
                  if (String(label.textContent || '').trim().toLowerCase() === 'official email') {
                    const v = label.nextElementSibling as HTMLElement | null;
                    if (v) {
                      v.style.whiteSpace = 'pre-wrap';
                      (v.style as any).overflowWrap = 'break-word';
                      (v.style as any).wordWrap = 'break-word';
                      (v.style as any).wordBreak = 'break-all';
                      v.style.maxWidth = '100%';
                      v.style.overflow = 'visible';
                      v.style.display = 'block';
                      v.style.width = '100%';
                      v.style.boxSizing = 'border-box';
                      v.style.paddingRight = '44px';
                      (v.style as any).paddingInlineEnd = '44px';
                      (v.style as any).maxWidth = 'calc(100% - 44px)';
                      (v.style as any).textOverflow = 'clip';

                      const t = String(v.textContent || '').trim();
                      const escapeHtml = (s: string) =>
                        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                      if (t && t.includes('@')) {
                        const [before, ...rest] = t.split('@');
                        const after = rest.join('@');
                        v.innerHTML = `<span style="display:block; width:100%;">${escapeHtml(before)}@</span><span style="display:block; width:100%;">${escapeHtml(after)}</span>`;
                        v.style.whiteSpace = 'normal';
                        v.style.height = 'auto';
                        v.style.minHeight = '0px';
                        v.style.lineHeight = '1.15';
                      } else if (t && t.length > 20 && !/\s/.test(t)) {
                        const chunks = t.match(/.{1,15}/g) || [t];
                        v.innerHTML = chunks.map(escapeHtml).join('<br/>');
                        v.style.whiteSpace = 'normal';
                      }
                    }
                  }
                });

                const moonshotSvgs = (scope as any).querySelectorAll?.(
                  'svg[aria-label="Moonshot Digital Logo"], svg[role="img"][aria-label], svg[role="img"]'
                ) as NodeListOf<SVGElement> | undefined;
                moonshotSvgs?.forEach(svg => {
                  const label = String(svg.getAttribute('aria-label') || '');
                  if (!/moonshot\s*digital/i.test(label)) return;
                  svg.setAttribute('width', svg.getAttribute('width') || '200');
                  svg.setAttribute('height', svg.getAttribute('height') || '52');
                  (svg as any).style.width = '200px';
                  (svg as any).style.height = 'auto';
                  (svg as any).style.display = 'block';
                  (svg as any).style.visibility = 'visible';
                });

                const avoidBreakEls = (scope as any).querySelectorAll?.('section, article, .rounded-3xl, .rounded-2xl, .rounded-xl, .rounded-lg') as NodeListOf<HTMLElement> | undefined;
                avoidBreakEls?.forEach(n => {
                  n.classList.add('pdf-avoid-break');
                  (n.style as any).breakInside = 'avoid';
                  (n.style as any).pageBreakInside = 'avoid';
                });
              },
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          })
          .save();
      } finally {
      }
    } catch (e) {
      alert('Failed to generate PDF.');
      console.error(e);
    }
  };

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
      try {
        const fontsAny: any = (document as any).fonts;
        if (fontsAny && typeof fontsAny.ready?.then === 'function') {
          await fontsAny.ready;
        }
      } catch {
      }

      const captureWidth = Math.ceil(Math.max(el.scrollWidth, el.getBoundingClientRect().width));
      const captureHeight = Math.ceil(Math.max(el.scrollHeight, el.getBoundingClientRect().height));

      const pdfBlob: Blob = await html2pdf()
        .from(el)
        .set({
          margin: [6, 6, 6, 6],
          filename: `Strategy-Brief-${safePdfName(String(selected.companyName || 'Lead'))}.pdf`,
          image: { type: 'jpeg', quality: 0.92 },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['.pdf-avoid-break'] },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
            windowWidth: captureWidth,
            windowHeight: captureHeight,
            onclone: (clonedDoc: Document) => {
              const clonedEl = clonedDoc.getElementById(el.id) as HTMLElement | null;
              const scope = clonedEl || clonedDoc;

              if (clonedEl) {
                clonedEl.style.boxSizing = 'border-box';
                clonedEl.style.paddingTop = '18px';
              }

              try {
                const styleEl = clonedDoc.createElement('style');
                styleEl.setAttribute('data-pdf-wrap-fix', 'true');
                styleEl.textContent = `
                    #${CSS.escape(el.id)} * { box-sizing: border-box !important; }
                    #${CSS.escape(el.id)} .grid > * { min-width: 0 !important; }
                    #${CSS.escape(el.id)} span.bg-brand-green {
                      display: inline-flex !important;
                      align-items: center !important;
                      justify-content: center !important;
                      text-align: center !important;
                      white-space: nowrap !important;
                      padding: 0 18px !important;
                      height: 32px !important;
                      min-height: 32px !important;
                      line-height: 1 !important;
                    }
                    #${CSS.escape(el.id)} .bg-slate-50.border-2.border-slate-200.rounded-3xl {
                      display: flex !important;
                      flex-direction: column !important;
                      justify-content: center !important;
                    }
                    #${CSS.escape(el.id)} .bg-slate-50.border-2.border-slate-100.rounded-3xl {
                      display: flex !important;
                      flex-direction: column !important;
                      justify-content: center !important;
                    }
                    #${CSS.escape(el.id)} p.text-brand-navy {
                      white-space: normal !important;
                      overflow-wrap: anywhere !important;
                      word-break: break-word !important;
                      max-width: 100% !important;
                    }
                  `;
                clonedDoc.head.appendChild(styleEl);
              } catch {
              }

              const badge = (scope as any).querySelector?.('span.bg-brand-green') as HTMLElement | null;
              if (badge) {
                badge.setAttribute(
                  'style',
                  'display: inline-flex !important; align-items: center !important; justify-content: center !important; text-align: center !important; white-space: nowrap !important; background-color: #13C15B !important; color: white !important; font-weight: 900 !important; text-transform: uppercase !important; letter-spacing: 0.3em !important; border-radius: 6px !important; line-height: 1 !important; margin-top: 20px !important; padding: 0 18px !important; font-size: 13px !important; height: 32px !important; min-height: 32px !important; width: auto !important; position: relative !important; z-index: 10 !important;'
                );
              } else {
                const spans = (scope as any).querySelectorAll?.('span') as NodeListOf<HTMLElement> | undefined;
                const byText = Array.from(spans || []).find(s =>
                  String(s.textContent || '').trim().toLowerCase().includes('comprehensive strategy brief')
                );
                if (byText) {
                  byText.setAttribute(
                    'style',
                    'display: inline-flex !important; align-items: center !important; justify-content: center !important; text-align: center !important; white-space: nowrap !important; background-color: #13C15B !important; color: white !important; font-weight: 900 !important; text-transform: uppercase !important; letter-spacing: 0.3em !important; border-radius: 6px !important; line-height: 1 !important; margin-top: 20px !important; padding: 0 18px !important; font-size: 13px !important; height: 32px !important; min-height: 32px !important; width: auto !important; position: relative !important; z-index: 10 !important;'
                  );
                }
              }

              try {
                const logoMount = (scope as any).querySelector?.('[data-pdf-logo]') as HTMLElement | null;
                if (logoMount) {
                  logoMount.innerHTML = '';
                  logoMount.style.display = 'flex';
                  logoMount.style.alignItems = 'center';
                  logoMount.style.justifyContent = 'flex-end';

                  const logoImg = clonedDoc.createElement('img');
                  logoImg.src = moonshotLogoDataUri;
                  logoImg.alt = 'Moonshot Digital Logo';
                  logoImg.style.width = '200px';
                  logoImg.style.height = '52px';
                  logoImg.style.objectFit = 'contain';
                  logoImg.style.display = 'block';
                  (logoImg as any).crossOrigin = 'anonymous';
                  logoMount.appendChild(logoImg);
                }
              } catch {
              }
            },
          },
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
                <button onClick={handleGeneratePdf} className="flex items-center gap-2 px-6 py-4 bg-white border-2 border-slate-300 rounded-xl hover:bg-slate-50 font-black text-[10px] uppercase tracking-widest shadow-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                  Generate PDF Discovery Report
                </button>
                <button onClick={() => setShowDeleteConfirm(true)} className="p-4 bg-white border-2 border-slate-300 text-brand-pink rounded-xl shadow-sm"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
              </div>

              <div id="admin-discovery-report" ref={reportRef} className="bg-white rounded-[2.5rem] p-8 md:p-20 space-y-20 border-2 border-slate-300 shadow-xl print:border-none print:p-0">
                {/* PDF Header */}
                <div className="flex justify-between items-start border-b-4 border-slate-900 pb-16">
                  <div className="space-y-6">
                    <span className="bg-brand-green text-white text-[10px] font-black px-4 py-1 rounded uppercase tracking-[0.3em]">Comprehensive Strategy Brief</span>
                    <h2 className="text-5xl md:text-6xl font-black text-brand-navy tracking-tighter uppercase leading-none">{selected.companyName}</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Analysis generated on {new Date(selected.submittedAt).toLocaleString()}</p>
                  </div>
                  <div data-pdf-logo>
                    <Logo />
                  </div>
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
    <p className={`text-brand-navy leading-relaxed whitespace-pre-wrap break-words max-w-full ${large ? 'text-sm md:text-base font-bold' : 'text-base md:text-xl font-black tracking-tight uppercase'}`}>
      {value || <span className="text-slate-400 italic font-bold">Unreported Intelligence</span>}
    </p>
  </div>
);

export default AdminDashboard;
