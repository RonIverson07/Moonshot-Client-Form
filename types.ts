
export interface FormData {
  id: string;
  submittedAt: string;
  // Contact Info
  companyName: string;
  companyLocation: string;
  contactPerson: string;
  phoneNumber: string;
  email: string;
  // Project Details
  projectTitle: string;
  projectType: string;
  provideAssets: string;
  currentWebsite?: string;
  // Deep Dive
  projectExcitement: string;
  companyDescription: string;
  existingDomain?: string;
  mainContactAuthority: string;
  reasonForNewSite: string;
  // Design & Branding
  hasLogo: string;
  logoProvided?: string;
  designLogoForYou?: string;
  targetMarket: string;
  visitorActions: string;
  uniqueSellingPoint: string;
  emotionalGoal: string;
  projectGoals: string;
  currentObstacles: string;
  inspirationLinks: string;
  requestedFeatures: string[];
  colorPreferences: string;
  seoKeywords: string;
  contentNeeds: string;
  maintenancePlan: string;
  turnaroundTime: string;
  budgetDeadline: string;
  longTermProjection: string;
  referralPlan: string;
  hasMarketingRoadmap: string;
}

export interface EmailSettings {
  supportEmail?: string;
  notificationEmail: string;
  isEnabled: boolean;
  // Direct Webmail SMTP Keys
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  useSSL?: boolean;
  webhookUrl?: string;
}

export type StepId = 'contact' | 'nature' | 'narrative' | 'brand' | 'strategy' | 'logistics';

export interface Step {
  id: StepId;
  label: string;
  description: string;
}
