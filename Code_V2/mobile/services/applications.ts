import api from './api';
import { ApplicationState, ApplicationSummary } from '../types/application';

export const applicationService = {
    getById: async (id: string): Promise<ApplicationState> => {
        const res = await api.get<ApplicationState>(`/api/applications/${id}`);
        return res.data;
    },

    getForOpportunity: async (oppId: string): Promise<ApplicationSummary[]> => {
        const res = await api.get<ApplicationSummary[]>(`/api/applications/opportunity/${oppId}`);
        return res.data;
    },

    getForVolunteer: async (volunteerId: string): Promise<ApplicationSummary[]> => {
        const res = await api.get<ApplicationSummary[]>(`/api/applications/volunteer/${volunteerId}`);
        return res.data;
    },

    approve: async (id: string): Promise<void> => {
        await api.post(`/api/applications/${id}/approve`);
    },

    reject: async (id: string, reason: string): Promise<void> => {
        await api.post(`/api/applications/${id}/reject`, { reason });
    },

    accept: async (id: string): Promise<void> => {
        await api.post(`/api/applications/${id}/accept`);
    },

    markNoShow: async (id: string): Promise<void> => {
        await api.post(`/api/applications/${id}/noshow`);
    },

    promote: async (id: string): Promise<void> => {
        await api.post(`/api/applications/${id}/promote`);
    },

    waitlist: async (id: string): Promise<void> => {
        await api.post(`/api/applications/${id}/waitlist`);
    },
};
