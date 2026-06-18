import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CloudSun,
  GraduationCap,
  Microscope,
  MonitorDot,
  Radar,
  Satellite,
  School,
  UserRoundSearch,
} from "lucide-react";
import type { UserPurpose, UserRole } from "./auth-types";

export const roleOptions: Array<{
  id: UserRole;
  title: string;
  description: string;
  icon: typeof GraduationCap;
}> = [
  {
    id: "student",
    title: "Student",
    description: "Explore atmospheric science, radiosonde data, and climate fundamentals.",
    icon: GraduationCap,
  },
  {
    id: "teacher",
    title: "Teacher",
    description: "Use weather intelligence for classroom demonstrations and guided learning.",
    icon: School,
  },
  {
    id: "researcher",
    title: "Researcher",
    description: "Compare atmospheric profiles and study weather behavior across stations.",
    icon: Microscope,
  },
  {
    id: "climate-scientist",
    title: "Climate Scientist",
    description: "Analyze vertical profiles, moisture layers, and climate-scale signals.",
    icon: CloudSun,
  },
  {
    id: "weather-analyst",
    title: "Weather Analyst",
    description: "Monitor soundings, winds, pressure layers, and operational conditions.",
    icon: Radar,
  },
  {
    id: "organization-employee",
    title: "Organization / Employee",
    description: "Support institutional weather operations and professional reporting.",
    icon: Building2,
  },
];

export const purposeOptions: Array<{
  id: UserPurpose;
  title: string;
  description: string;
  icon: typeof BookOpen;
}> = [
  {
    id: "learning-climate-science",
    title: "Learning Climate Science",
    description: "Build confidence with scientific weather concepts and visual analysis.",
    icon: BookOpen,
  },
  {
    id: "academic-research",
    title: "Academic Research",
    description: "Use structured sounding data for projects, papers, and investigation.",
    icon: UserRoundSearch,
  },
  {
    id: "weather-forecasting",
    title: "Weather Forecasting",
    description: "Review current profiles and compare historic atmospheric behavior.",
    icon: Satellite,
  },
  {
    id: "environmental-monitoring",
    title: "Environmental Monitoring",
    description: "Track humidity, winds, pressure, and detected atmospheric events.",
    icon: MonitorDot,
  },
  {
    id: "classroom-teaching",
    title: "Classroom Teaching",
    description: "Turn live scientific dashboards into practical learning material.",
    icon: School,
  },
  {
    id: "professional-climate-analysis",
    title: "Professional Climate Analysis",
    description: "Support meteorological departments and institutional reporting workflows.",
    icon: BarChart3,
  },
  {
    id: "personal-interest",
    title: "Personal Interest",
    description: "Follow local weather intelligence and learn how the atmosphere behaves.",
    icon: BriefcaseBusiness,
  },
];
