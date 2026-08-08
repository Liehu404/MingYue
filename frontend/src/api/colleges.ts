import client from './client';

export interface College {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export const collegeApi = {
  list: () => client.get<College[]>('/colleges'),
  get: (id: number) => client.get<College>(`/colleges/${id}`),
  create: (data: { name: string; description?: string }) =>
    client.post('/colleges', data),
  update: (id: number, data: { name?: string; description?: string }) =>
    client.put(`/colleges/${id}`, data),
  remove: (id: number) => client.delete(`/colleges/${id}`),
};
