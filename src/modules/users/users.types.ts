import type { Role } from "@/common/constants/app.constants";

/** The projection other modules are allowed to read — never the entity itself. */
export interface UserProfile {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  profile: {
    name: string;
    imageUrl: string | null;
  };
}
