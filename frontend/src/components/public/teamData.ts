// The "Our team" section on the Home page reads everything from here.
//
// To use the real details later, edit this list:
//   - name / role / bio: plain text
//   - photo: put the picture in frontend/public/team/ and write its path,
//     e.g. photo: "/team/priya.jpg" (square photos, at least 400x400, look best).
//     With no photo, a coloured initials badge is shown instead.
//   - links: optional email / phone / linkedin / instagram (leave out what you don't need)
export interface TeamMember {
    name: string;
    role: string;
    bio: string;
    photo?: string;
    links?: {
      email?: string;
      phone?: string;
      linkedin?: string;
      instagram?: string;
    };
  }
  
  export const TEAM: TeamMember[] = [
    {
      name: "Team Member One",
      role: "Founder & Event Lead",
      bio: "Plans every detail so hosts can enjoy their own celebration. Add a short line about this person here.",
      links: { email: "hello@example.com" },
    },
    {
      name: "Team Member Two",
      role: "Design & Invitations",
      bio: "Turns ideas into invitations people want to keep. Add a short line about this person here.",
      links: { instagram: "https://instagram.com/" },
    },
    {
      name: "Team Member Three",
      role: "Guest Experience",
      bio: "Makes sure every guest feels welcome from the first message. Add a short line about this person here.",
      links: { linkedin: "https://linkedin.com/" },
    },
    {
      name: "Team Member Four",
      role: "Tech & Support",
      bio: "Keeps everything running smoothly and answers your questions fast. Add a short line about this person here.",
      links: { phone: "+910000000000" },
    },
  ];