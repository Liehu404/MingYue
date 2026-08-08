import client from './client';

export interface LoginParams {
  username?: string;
  password?: string;
  phone?: string;
  code?: string;
}

export interface RegisterParams {
  username: string;
  email: string;
  password: string;
  display_name: string;
  real_name: string;
  phone: string;
  code: string;
  student_id?: string;
  grade?: string;
  major?: string;
}

export const authApi = {
  login: (data: LoginParams) => client.post('/auth/login', data),
  register: (data: RegisterParams) => client.post('/auth/register', data),
  sendCode: (phone: string, purpose = 'register') =>
    client.post('/auth/send-code', { phone, purpose }),
  me: () => client.get('/auth/me'),
};
