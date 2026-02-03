
import React from 'react';
import { Step } from './types';

// Exporting missing BUSINESS_NAME constant
export const BUSINESS_NAME = 'Moonshot Digital';

export const STEPS: Step[] = [
  { id: 'contact', label: 'Contact', description: 'Who are we talking to?' },
  { id: 'nature', label: 'Nature', description: 'What are we building?' },
  { id: 'narrative', label: 'Narrative', description: 'Why this project?' },
  { id: 'brand', label: 'Brand', description: 'Look and feel' },
  { id: 'strategy', label: 'Strategy', description: 'Market & Conversion' },
  { id: 'logistics', label: 'Logistics', description: 'Time & Budget' },
];

export const Logo = () => (
  <div className="flex items-center">
    <img 
      src="https://moonshotdigital.com.ph/logo.svg" 
      alt="Moonshot Digital Logo" 
      className="h-10 md:h-12 w-auto object-contain"
    />
  </div>
);
