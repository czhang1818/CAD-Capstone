import api from './api';
import { OpportunityState, OpportunitySummary, OpportunityRecommendationResult } from '../types/opportunity';

export const opportunityService = {
    getById: async (id: string): Promise<OpportunityState> => {
        const res = await api.get<OpportunityState>(`/api/opportunities/${id}`);
        return res.data;
    },

    search: async (query?: string, category?: string): Promise<OpportunitySummary[]> => {
        const params = new URLSearchParams();
        if (query) params.append('query', query);
        if (category) params.append('category', category);
        const res = await api.get<OpportunitySummary[]>(`/api/opportunities/?${params.toString()}`);
        return res.data;
    },

    getByIds: async (ids: string[]): Promise<OpportunitySummary[]> => {
        const params = new URLSearchParams();
        ids.forEach(id => params.append('ids', id));
        const res = await api.get<OpportunitySummary[]>(`/api/opportunities/by-ids?${params.toString()}`);
        return res.data;
    },

    publish: async (id: string): Promise<void> => {
        await api.post(`/api/opportunities/${id}/publish`);
    },

    cancel: async (id: string, reason: string): Promise<void> => {
        await api.post(`/api/opportunities/${id}/cancel`, { reason });
    },

    addShift: async (id: string, data: { name: string; startTime: string; endTime: string; maxCapacity: number }): Promise<void> => {
        await api.post(`/api/opportunities/${id}/shifts`, data);
    },

    apply: async (id: string, data: { volunteerId: string; shiftId: string; idempotencyKey: string }): Promise<{ applicationId: string }> => {
        const res = await api.post(`/api/opportunities/${id}/apply`, data);
        return res.data;
    },

    withdrawApplication: async (oppId: string, appId: string): Promise<void> => {
        await api.delete(`/api/opportunities/${oppId}/apply/${appId}`);
    },

    validateGeo: async (id: string, lat: number, lon: number): Promise<boolean> => {
        const res = await api.post<{ isValid: boolean }>(`/api/opportunities/${id}/validate-geo`, { lat, lon });
        return res.data.isValid;
    },

    recommendForVolunteer: async (params: {
        volunteerId: string;
        lat?: number;
        lon?: number;
        query?: string;
        category?: string;
        take?: number;
    }): Promise<OpportunityRecommendationResult> => {
        const p = new URLSearchParams();
        p.append('volunteerId', params.volunteerId);
        if (params.lat != null) p.append('lat', String(params.lat));
        if (params.lon != null) p.append('lon', String(params.lon));
        if (params.query) p.append('query', params.query);
        if (params.category) p.append('category', params.category);
        if (params.take != null) p.append('take', String(params.take));
        const res = await api.get<OpportunityRecommendationResult>(`/api/opportunities/recommend?${p.toString()}`);
        return res.data;
    },
};
