export const LIFE_EVENT_TYPES = {
  // Personal
  new_pet: { label: "New Pet", card: "Congratulations on the new addition to your family!", category: "personal" },
  new_baby: { label: "New Baby", card: "Congratulations on the new baby!", category: "personal" },
  pregnancy: { label: "Pregnancy", card: "So excited for you and your growing family!", category: "personal" },
  wedding: { label: "Wedding", card: "Congratulations on your wedding!", category: "personal" },
  engagement: { label: "Engagement", card: "Congratulations on your engagement!", category: "personal" },
  new_home: { label: "New Home", card: "Congratulations on your new home!", category: "personal" },
  moving: { label: "Moving", card: "Wishing you all the best in your new place!", category: "personal" },
  graduation: { label: "Graduation", card: "Congratulations on your graduation!", category: "personal" },
  retirement: { label: "Retirement", card: "Congratulations on your retirement!", category: "personal" },
  birthday: { label: "Birthday", card: "Happy Birthday!", category: "personal" },

  // Health
  cancer_free: { label: "Cancer Free", card: "So incredibly happy to hear this amazing news!", category: "health" },
  remission: { label: "Remission", card: "This is such wonderful news — so happy for you!", category: "health" },
  surgery_recovery: { label: "Surgery Recovery", card: "Wishing you a speedy and full recovery!", category: "health" },
  sobriety_milestone: { label: "Sobriety Milestone", card: "So proud of you — this is a huge accomplishment!", category: "health" },
  marathon_completed: { label: "Marathon Completed", card: "Congratulations on finishing the race!", category: "health" },
  health_milestone: { label: "Health Milestone", card: "So proud of everything you've accomplished!", category: "health" },

  // Professional
  promotion: { label: "Promotion", card: "Congratulations on your well-deserved promotion!", category: "professional" },
  new_job: { label: "New Job", card: "Congratulations on the new role!", category: "professional" },
  acquisition: { label: "Company Acquisition", card: "Congratulations on this incredible milestone!", category: "professional" },
  funding_round: { label: "Funding Round", card: "Congratulations on the funding — exciting times ahead!", category: "professional" },
  award_won: { label: "Award Won", card: "Congratulations — so well deserved!", category: "professional" },
  major_deal: { label: "Major Deal Closed", card: "Congratulations on closing such a big win!", category: "professional" },
  company_milestone: { label: "Company Milestone", card: "Congratulations on this incredible milestone!", category: "professional" },
  speaking_event: { label: "Speaking Engagement", card: "Congratulations — can't wait to hear how it goes!", category: "professional" },
  book_published: { label: "Book Published", card: "Congratulations on publishing your book!", category: "professional" },
  media_feature: { label: "Media Feature", card: "Congratulations on the well-deserved recognition!", category: "professional" },
};

export type LifeEventType = keyof typeof LIFE_EVENT_TYPES;