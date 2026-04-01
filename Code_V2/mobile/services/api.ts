import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../constants/config';

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach JWT token
api.interceptors.request.use(async (config) => {
    const token = await SecureStore.getItemAsync('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    console.log(`[Axios Request] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    return config;
});

import { useAuthStore } from '../stores/authStore';

// Response interceptor — handle 401
api.interceptors.response.use(
    (response) => {
        console.log(`[Axios Response] ${response.status} ${response.config.url}`);
        return response;
    },
    async (error) => {
        console.log(`[Axios Error] ${error.message} on ${error.config?.url}`);
        if (error.response) {
            console.log(`[Axios Error Response] Status: ${error.response.status}`);
            if (error.response.status === 401) {
                await useAuthStore.getState().logout();
            }
        } else {
            console.log(`[Axios Raw Error]`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
        }
        return Promise.reject(error);
    }
);

export default api;
