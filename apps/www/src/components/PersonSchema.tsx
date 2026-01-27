export default function PersonSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': 'https://anipotts.com/#person',
    name: 'Ani Potts',
    givenName: 'Anirudh',
    familyName: 'Pottammal',
    alternateName: ['Anirudh Pottammal', 'Ani Pottammal'],
    description:
      'Software engineer based in NYC who builds minimal interfaces to orchestrate complex systems.',
    url: 'https://anipotts.com',
    image: 'https://anipotts.com/images/ani-potts-headshot.png',
    sameAs: [
      'https://twitter.com/anipottsbuilds',
      'https://github.com/anipotts',
      'https://linkedin.com/in/anipotts',
      'https://instagram.com/anipottsbuilds',
      'https://tiktok.com/@anipottsbuilds',
    ],
    jobTitle: 'Software Engineer',
    alumniOf: {
      '@type': 'EducationalOrganization',
      name: 'New York University',
    },
    knowsAbout: [
      'React',
      'TypeScript',
      'Next.js',
      'Python',
      'Software Engineering',
      'System Design',
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
