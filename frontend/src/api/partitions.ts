import client from './client';

export interface Partition {
  id: number;
  name: string;
  description: string;
  parent_id: number | null;
  sort_order: number;
  created_at: string;
  children?: Partition[];
}

export const partitionApi = {
  list: () => client.get<Partition[]>('/partitions'),
  tree: () => client.get<Partition[]>('/partitions/tree'),
  create: (data: Record<string, unknown>) => client.post('/partitions', data),
  update: (id: number, data: Record<string, unknown>) =>
    client.put(`/partitions/${id}`, data),
  remove: (id: number) => client.delete(`/partitions/${id}`),
};
