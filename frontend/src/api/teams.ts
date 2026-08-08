import client from './client';

export interface DecorationSettings {
  hero_bg_url?: string;
  accent_color?: string;
  font_family?: 'sf-pro' | 'serif' | 'mono' | 'rounded';
  bg_pattern?: 'dots' | 'grid' | 'mesh-light' | 'mesh-dark' | 'radial-glow' | 'none';
  glass_intensity?: 'light' | 'medium' | 'heavy';
  text_shadow?: 'soft' | 'elevated' | 'glow' | 'none';
  section_bg_color?: string;
}

export interface TeamMember {
  id: number;
  team_id: number;
  user_id: number;
  team_role: string;
  tech_partition_id: number | null;
  position_title: string;
  parent_member_id: number | null;
  joined_at: string | null;
  user?: { id: number; username: string; display_name: string; role: string };
}

export interface RoleDefinition {
  label: string;
  color: string;
}

export interface Team {
  id: number;
  name: string;
  description: string;
  college_id: number;
  advisor_teacher_id: number;
  avatar_url: string;
  tags: string;
  category: string;
  created_at: string;
  updated_at: string | null;
  members?: TeamMember[];
  decoration?: DecorationSettings;
  role_definitions?: Record<string, RoleDefinition>;
}

export interface TeamOverview {
  total_teams: number;
  total_members: number;
  total_resources: number;
  recent_uploads: number;
  team_stats: {
    team_id: number;
    team_name: string;
    description: string;
    category: string;
    tags: string;
    member_count: number;
    role_distribution: Record<string, number>;
    recent_uploads: number;
    total_uploads: number;
    recent_notices: number;
  }[];
}

export interface Notice {
  id: number;
  team_id: number;
  author_id: number;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export const teamApi = {
  list: (params?: Record<string, unknown>) =>
    client.get<Team[]>('/teams', { params }),
  get: (id: number) => client.get<Team>(`/teams/${id}`),
  create: (data: Record<string, unknown>) => client.post('/teams', data),
  update: (id: number, data: Record<string, unknown>) =>
    client.put(`/teams/${id}`, data),
  remove: (id: number) => client.delete(`/teams/${id}`),
  overview: () => client.get<TeamOverview>('/teams/overview'),
  members: {
    list: (id: number) => client.get<TeamMember[]>(`/teams/${id}/members`),
    add: (teamId: number, data: Record<string, unknown>) =>
      client.post(`/teams/${teamId}/members`, data),
    update: (teamId: number, userId: number, data: Record<string, unknown>) =>
      client.put(`/teams/${teamId}/members/${userId}`, data),
    remove: (teamId: number, userId: number) =>
      client.delete(`/teams/${teamId}/members/${userId}`),
  },
  notices: {
    list: (id: number) => client.get<Notice[]>(`/teams/${id}/notices`),
    create: (id: number, data: { title: string; content: string; is_pinned?: boolean }) =>
      client.post(`/teams/${id}/notices`, data),
  },
  joinRequests: {
    list: (id: number) => client.get(`/teams/${id}/join-requests`),
    create: (id: number, message: string) =>
      client.post(`/teams/${id}/join-request`, { message }),
    decide: (teamId: number, requestId: number, decision: string) =>
      client.put(`/teams/${teamId}/join-requests/${requestId}`, { decision }),
  },
  myRequests: () => client.get('/teams/my-requests'),
  decoration: {
    get: (teamId: number) =>
      client.get<DecorationSettings>(`/teams/${teamId}/decoration`),
    update: (teamId: number, data: DecorationSettings) =>
      client.put(`/teams/${teamId}/decoration`, { decoration: data }),
  },
  roles: {
    get: (teamId: number) =>
      client.get<Record<string, RoleDefinition>>(`/teams/${teamId}/role-definitions`),
    update: (teamId: number, data: Record<string, RoleDefinition>) =>
      client.put(`/teams/${teamId}/role-definitions`, { role_definitions: data }),
  },
};
