import client from './client';

export interface User {
  id: number;
  username: string;
  email: string;
  display_name: string;
  role: string;
  phone: string | null;
  college_id: number | null;
  is_active: boolean;
}

export const userApi = {
  list: (params?: Record<string, unknown>) =>
    client.get<User[]>('/users', { params }),
  get: (id: number) => client.get<User>(`/users/${id}`),
  create: (data: Record<string, unknown>) => client.post('/users', data),
  update: (id: number, data: Record<string, unknown>) =>
    client.put(`/users/${id}`, data),
  remove: (id: number) => client.delete(`/users/${id}`),
  approve: (id: number) => client.put(`/users/${id}/approve`),
};
