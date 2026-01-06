export interface SocialLink {
  name: string;
  url: string;
  icon: string;
  description?: string;
}

export interface LinkInBio {
  id: string;
  title: string;
  url: string;
  description?: string;
  icon?: string;
  order: number;
}
