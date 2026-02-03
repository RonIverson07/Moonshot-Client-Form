import React, { useState } from 'react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { FormData, StepId } from '../types';
import { STEPS, Logo, BUSINESS_NAME } from '../constants';

interface Props {
  onSubmit: (data: FormData) => void;
}

const ClientForm: React.FC<Props> = ({ onSubmit }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<Partial<FormData>>({
    requestedFeatures: [],
  });

  const LONG_TEXT_FIELDS: Set<keyof FormData> = new Set([
    'projectExcitement',
    'companyDescription',
    'reasonForNewSite',
    'mainContactAuthority',
    'emotionalGoal',
    'colorPreferences',
    'inspirationLinks',
    'targetMarket',
    'visitorActions',
    'uniqueSellingPoint',
    'seoKeywords',
    'budgetDeadline',
    'longTermProjection',
    'referralPlan',
  ]);

  const currentStep = STEPS[currentStepIndex];

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete (next as any)[field];
        return next;
      });
    }
  };

  const validateCurrentStep = () => {
    const newErrors: Record<string, string> = {};
    let fieldsToValidate: (keyof FormData)[] = [];

    switch (currentStep.id) {
      case 'contact':
        fieldsToValidate = ['companyName', 'companyLocation', 'contactPerson', 'email', 'phoneNumber'];
        break;
      case 'nature':
        fieldsToValidate = ['projectTitle', 'projectType', 'provideAssets'];
        break;
      case 'narrative':
        fieldsToValidate = ['projectExcitement', 'companyDescription', 'reasonForNewSite', 'mainContactAuthority'];
        break;
      case 'brand':
        fieldsToValidate = ['hasLogo', 'emotionalGoal', 'colorPreferences', 'inspirationLinks'];
        if (formData.hasLogo === 'No') fieldsToValidate.push('designLogoForYou');
        break;
      case 'strategy':
        fieldsToValidate = ['targetMarket', 'visitorActions', 'uniqueSellingPoint', 'seoKeywords'];
        break;
      case 'logistics':
        fieldsToValidate = ['budgetDeadline', 'longTermProjection', 'referralPlan', 'hasMarketingRoadmap'];
        break;
    }

    fieldsToValidate.forEach(field => {
      const val = formData[field];
      if (!val || (Array.isArray(val) && val.length === 0)) {
        newErrors[field] = 'Required Field';
      }
    });

    fieldsToValidate.forEach(field => {
      if (newErrors[field]) return;
      const val = formData[field];
      if (LONG_TEXT_FIELDS.has(field) && typeof val === 'string') {
        const len = val.trim().length;
        if (len < 10) newErrors[field] = 'Minimum 10 characters';
        else if (len > 500) newErrors[field] = 'Maximum 500 characters';
      }
    });

    if (!newErrors.email && typeof formData.email === 'string') {
      const email = formData.email.trim().toLowerCase();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailOk) {
        newErrors.email = 'Invalid Email';
      } else {
        const domain = email.split('@').pop() || '';
        const allowed = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com'];
        if (!allowed.includes(domain)) newErrors.email = 'Use gmail.com, yahoo.com, or Microsoft mail (outlook/hotmail/live)';
      }
    }

    if (!newErrors.phoneNumber && typeof formData.phoneNumber === 'string') {
      const phone = formData.phoneNumber.trim();
      const ok = /^\+[1-9]\d{6,14}$/.test(phone) && isValidPhoneNumber(phone);
      if (!ok) newErrors.phoneNumber = 'Enter a valid phone number';
    }

    if (!newErrors.currentWebsite && typeof formData.currentWebsite === 'string' && formData.currentWebsite.trim() !== '') {
      try {
        const u = new URL(formData.currentWebsite);
        if (!u.protocol || (u.protocol !== 'http:' && u.protocol !== 'https:')) {
          newErrors.currentWebsite = 'Must start with http:// or https://';
        }
      } catch {
        newErrors.currentWebsite = 'Invalid URL (use https://...)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = async () => {
    if (!validateCurrentStep()) return;

    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setIsSubmitting(true);
      const finalData: FormData = {
        ...formData,
        phoneNumber: String(formData.phoneNumber || ''),
        id: Math.random().toString(36).substr(2, 9),
        submittedAt: new Date().toISOString(),
      } as FormData;
      
      try {
        await onSubmit(finalData);
        setIsSubmitted(true);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
      setErrors({});
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-brand-navy">
        <div className="max-w-md w-full glass-morphism p-8 md:p-12 rounded-[2rem] md:rounded-[2.5rem] text-center shadow-2xl border border-white/20">
          <div className="w-16 h-16 md:w-24 md:h-24 bg-brand-green/10 text-brand-green rounded-full flex items-center justify-center mx-auto mb-6 md:mb-8">
            <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-brand-navy mb-4 tracking-tight uppercase leading-none">Mission Success!</h2>
          <p className="text-slate-700 mb-8 md:mb-10 text-md md:text-lg leading-relaxed font-semibold">
            Your vision has been received. {BUSINESS_NAME} is analyzing your strategy now.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-brand-green text-white py-4 md:py-5 rounded-2xl font-bold hover:brightness-110 shadow-lg shadow-brand-green/20 transition-all text-md md:text-lg uppercase tracking-widest"
          >
            Finish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-10 md:pb-20">
      <header className="sticky top-0 z-50 glass-morphism border-b border-slate-300 px-4 md:px-8 py-3 md:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 md:gap-12">
            <Logo />
            <div className="hidden lg:flex items-center gap-4">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">{currentStepIndex + 1} / {STEPS.length}</span>
              <div className="flex gap-1 md:gap-1.5">
                {STEPS.map((_, i) => (
                  <div 
                    key={i} 
                    className={`h-1.5 w-4 md:w-8 rounded-full transition-all duration-700 ${i <= currentStepIndex ? 'bg-brand-green' : 'bg-slate-300'}`} 
                  />
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <a 
              href="mailto:hello@moonshotdigital.com.ph"
              className="px-4 py-2 md:px-6 md:py-3 rounded-xl bg-brand-navy text-white font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md flex items-center gap-2"
            >
              Contact Us
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 pt-10 md:pt-20">
        <div className="mb-10 md:mb-16">
          <span className="text-brand-green font-black text-[10px] md:text-xs uppercase tracking-widest mb-2 md:mb-4 block">Section {currentStepIndex + 1}</span>
          <h1 className="text-3xl md:text-5xl font-black text-brand-navy mb-2 md:mb-4 tracking-tighter leading-none uppercase">{currentStep.label}</h1>
          <p className="text-md md:text-xl text-slate-600 font-bold">{currentStep.description}</p>
        </div>

        <div className="space-y-8 md:space-y-12 step-transition">
          {currentStep.id === 'contact' && (
            <div className="space-y-6 md:space-y-8">
              <InputField label="Company Name" required error={errors.companyName} value={formData.companyName} onChange={v => updateField('companyName', v)} />
              <InputField label="Company Location" required error={errors.companyLocation} value={formData.companyLocation} onChange={v => updateField('companyLocation', v)} />
              <InputField label="Contact Person" required error={errors.contactPerson} value={formData.contactPerson} onChange={v => updateField('contactPerson', v)} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputField label="Email Address" type="email" required error={errors.email} value={formData.email} onChange={v => updateField('email', v)} />
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] md:text-sm font-black text-brand-navy uppercase tracking-wider flex items-center gap-1.5">
                    Phone Number <span className="text-brand-pink">*</span>
                  </label>
                  <PhoneInput
                    international
                    defaultCountry="PH"
                    countryCallingCodeEditable={false}
                    value={typeof formData.phoneNumber === 'string' ? formData.phoneNumber : ''}
                    onChange={(v) => updateField('phoneNumber', v || '')}
                    className={`bg-white border-2 ${errors.phoneNumber ? 'border-brand-pink bg-brand-pink/5' : 'border-slate-400 focus-within:border-brand-green'} p-4 md:p-5 rounded-xl text-slate-900 font-bold transition-all shadow-sm text-sm md:text-base`}
                    numberInputProps={{
                      className: 'bg-transparent outline-none w-full',
                      placeholder: '+63 917 123 4567',
                    }}
                  />
                  {errors.phoneNumber && <span className="text-[11px] text-brand-pink font-black uppercase tracking-tight">{String(errors.phoneNumber)}</span>}
                </div>
              </div>
            </div>
          )}

          {currentStep.id === 'nature' && (
            <div className="space-y-6 md:space-y-8">
              <InputField label="Project Title" required error={errors.projectTitle} placeholder="e.g., E-Commerce Transformation" value={formData.projectTitle} onChange={v => updateField('projectTitle', v)} />
              <SelectField 
                label="Project Type" 
                required
                error={errors.projectType}
                options={['E-Commerce Website', 'Web3 Project', 'Marketing Website', 'Editorial Website', 'Custom Software']} 
                value={formData.projectType} 
                onChange={v => updateField('projectType', v)} 
              />
              <RadioField 
                label="Will you provide assets (copy, images, brand guidelines)?" 
                required
                error={errors.provideAssets}
                options={['Yes', 'No']} 
                value={formData.provideAssets} 
                onChange={v => updateField('provideAssets', v)} 
              />
              <InputField label="Current Website (if any)" placeholder="https://..." error={errors.currentWebsite} value={formData.currentWebsite} onChange={v => updateField('currentWebsite', v)} />
            </div>
          )}

          {currentStep.id === 'narrative' && (
            <div className="space-y-6 md:space-y-8">
              <TextArea label="What excites you about this project?" required error={errors.projectExcitement} hint="Understanding your passion helps us design better." value={formData.projectExcitement} onChange={v => updateField('projectExcitement', v)} />
              <TextArea label="Can you describe your company?" required error={errors.companyDescription} hint="Values, history, and core products/services." value={formData.companyDescription} onChange={v => updateField('companyDescription', v)} />
              <TextArea label="Why do you want a new website or redesign?" required error={errors.reasonForNewSite} hint="What is the primary objective?" value={formData.reasonForNewSite} onChange={v => updateField('reasonForNewSite', v)} />
              <TextArea label="Who is the main contact & decision maker?" required error={errors.mainContactAuthority} value={formData.mainContactAuthority} onChange={v => updateField('mainContactAuthority', v)} />
            </div>
          )}

          {currentStep.id === 'brand' && (
            <div className="space-y-6 md:space-y-8">
              <RadioField label="Do you have a company logo?" required error={errors.hasLogo} options={['Yes', 'No']} value={formData.hasLogo} onChange={v => updateField('hasLogo', v)} />
              {formData.hasLogo === 'No' && (
                 <RadioField label="Would you like us to design a logo for you?" required error={errors.designLogoForYou} options={['Yes', 'No']} value={formData.designLogoForYou} onChange={v => updateField('designLogoForYou', v)} />
              )}
              <TextArea label="What emotions should visitors feel?" required error={errors.emotionalGoal} hint="Trust, innovation, luxury, or excitement?" value={formData.emotionalGoal} onChange={v => updateField('emotionalGoal', v)} />
              <TextArea label="Color preferences, look & feel?" required error={errors.colorPreferences} value={formData.colorPreferences} onChange={v => updateField('colorPreferences', v)} />
              <TextArea label="Style References (Links)" required error={errors.inspirationLinks} hint="Links to designs you admire." value={formData.inspirationLinks} onChange={v => updateField('inspirationLinks', v)} />
            </div>
          )}

          {currentStep.id === 'strategy' && (
            <div className="space-y-6 md:space-y-8">
              <TextArea label="Target Market & Ideal Customer" required error={errors.targetMarket} hint="Who are we building this for?" value={formData.targetMarket} onChange={v => updateField('targetMarket', v)} />
              <TextArea label="What actions should visitors take?" required error={errors.visitorActions} hint="Buy, subscribe, or contact?" value={formData.visitorActions} onChange={v => updateField('visitorActions', v)} />
              <TextArea label="What sets you apart from competitors?" required error={errors.uniqueSellingPoint} value={formData.uniqueSellingPoint} onChange={v => updateField('uniqueSellingPoint', v)} />
              <MultiSelect 
                label="Requested Features" 
                options={['Contact Page', 'Gallery Page', 'Video Integration', 'Newsletter', 'Social Media', 'Blog/CMS', 'Live Chat', 'E-commerce']} 
                selected={formData.requestedFeatures || []} 
                onChange={v => updateField('requestedFeatures', v)} 
              />
              <TextArea label="SEO Focus Keywords" required error={errors.seoKeywords} value={formData.seoKeywords} onChange={v => updateField('seoKeywords', v)} />
            </div>
          )}

          {currentStep.id === 'logistics' && (
            <div className="space-y-6 md:space-y-8">
              <InputField label="Ballpark Budget & Ideal Launch Date" required error={errors.budgetDeadline} placeholder="e.g., $15k+ / Launch by October" value={formData.budgetDeadline} onChange={v => updateField('budgetDeadline', v)} />
              <TextArea label="Long-term Business Projection" required error={errors.longTermProjection} hint="Where do you see the site in 2 years?" value={formData.longTermProjection} onChange={v => updateField('longTermProjection', v)} />
              <TextArea label="Repeat Visitor & Referral Strategy" required error={errors.referralPlan} value={formData.referralPlan} onChange={v => updateField('referralPlan', v)} />
              <RadioField label="Digital Marketing Roadmap Ready?" required error={errors.hasMarketingRoadmap} options={['Yes', 'No']} value={formData.hasMarketingRoadmap} onChange={v => updateField('hasMarketingRoadmap', v)} />
            </div>
          )}
        </div>

        <div className="mt-16 md:mt-24 flex items-center justify-between border-t border-slate-300 pt-8 md:pt-12">
          <button 
            onClick={handleBack}
            disabled={isSubmitting}
            className={`px-4 md:px-8 py-3 md:py-4 font-bold rounded-2xl transition-all ${currentStepIndex === 0 ? 'opacity-0 pointer-events-none' : 'text-slate-500 hover:text-brand-navy hover:bg-slate-200 border border-slate-300'}`}
          >
            Back
          </button>
          <button 
            onClick={handleNext}
            disabled={isSubmitting}
            className={`px-8 md:px-12 py-4 md:py-5 bg-brand-green text-white rounded-2xl font-black shadow-xl shadow-brand-green/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 md:gap-3 text-md md:text-lg uppercase tracking-widest ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-3">
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Transmitting...
              </span>
            ) : (
              <>
                {currentStepIndex === STEPS.length - 1 ? 'Launch Strategy' : 'Continue'}
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
};

const InputField = ({ label, type = 'text', required, value = '', onChange, placeholder = '', error }: any) => (
  <div className="flex flex-col gap-2">
    <label className="text-[12px] md:text-sm font-black text-brand-navy uppercase tracking-wider flex items-center gap-1.5">
      {label} {required && <span className="text-brand-pink">*</span>}
    </label>
    <input 
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-white border-2 ${error ? 'border-brand-pink bg-brand-pink/5' : 'border-slate-400 focus:border-brand-green'} p-4 md:p-5 rounded-xl text-slate-900 font-bold transition-all placeholder:text-slate-300 shadow-sm text-sm md:text-base`} 
    />
    {error && <span className="text-[11px] text-brand-pink font-black uppercase tracking-tight">{String(error)}</span>}
  </div>
);

const TextArea = ({ label, required, value = '', onChange, hint, error }: any) => (
  <div className="flex flex-col gap-2">
    <label className="text-[12px] md:text-sm font-black text-brand-navy uppercase tracking-wider flex items-center gap-1.5">
      {label} {required && <span className="text-brand-pink">*</span>}
    </label>
    {hint && <p className="text-[11px] md:text-xs text-slate-500 font-bold -mt-1">{hint}</p>}
    <textarea 
      rows={4}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`bg-white border-2 ${error ? 'border-brand-pink bg-brand-pink/5' : 'border-slate-400 focus:border-brand-green'} p-4 md:p-5 rounded-xl text-slate-900 font-bold transition-all shadow-sm text-sm md:text-base`} 
    />
    {error && <span className="text-[11px] text-brand-pink font-black uppercase tracking-tight">{String(error)}</span>}
  </div>
);

const SelectField = ({ label, options, value, onChange, required, error }: any) => (
  <div className="flex flex-col gap-2">
    <label className="text-[12px] md:text-sm font-black text-brand-navy uppercase tracking-wider">{label} {required && <span className="text-brand-pink">*</span>}</label>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
      {options.map((opt: string) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`p-4 md:p-5 rounded-xl border-2 text-left transition-all font-black text-sm ${value === opt ? 'bg-brand-green border-brand-green text-white' : error ? 'border-brand-pink bg-brand-pink/5' : 'bg-white border-slate-400 text-slate-800 hover:border-slate-600'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  </div>
);

const RadioField = ({ label, options, value, onChange, required, error }: any) => (
  <div className="flex flex-col gap-2">
    <label className="text-[12px] md:text-sm font-black text-brand-navy uppercase tracking-wider">{label} {required && <span className="text-brand-pink">*</span>}</label>
    <div className="flex gap-3 md:gap-4">
      {options.map((opt: string) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex-1 p-4 md:p-5 rounded-xl border-2 transition-all text-center font-black text-sm ${value === opt ? 'bg-brand-green border-brand-green text-white shadow-lg shadow-brand-green/20' : error ? 'border-brand-pink bg-brand-pink/5' : 'bg-white border-slate-400 text-slate-800 hover:border-slate-600'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  </div>
);

const MultiSelect = ({ label, options, selected, onChange }: any) => (
  <div className="flex flex-col gap-2">
    <label className="text-[12px] md:text-sm font-black text-brand-navy uppercase tracking-wider">{label}</label>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
      {options.map((opt: string) => (
        <label key={opt} className={`flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border-2 cursor-pointer transition-all font-black ${selected.includes(opt) ? 'bg-brand-green/10 border-brand-green text-brand-green' : 'bg-white border-slate-400 text-slate-800 hover:border-slate-600'}`}>
          <input 
            type="checkbox" 
            checked={selected.includes(opt)}
            onChange={() => {
              const next = selected.includes(opt) ? selected.filter((s: any) => s !== opt) : [...selected, opt];
              onChange(next);
            }}
            className="w-4 h-4 md:w-5 md:h-5 accent-brand-green rounded"
          />
          <span className="text-[11px] md:text-sm uppercase tracking-tight">{opt}</span>
        </label>
      ))}
    </div>
  </div>
);

export default ClientForm;
