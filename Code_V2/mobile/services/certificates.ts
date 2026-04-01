import api from './api';

export interface CertificateTemplate {
    id: string;
    name: string;
    description: string;
    organizationId: string | null;
    organizationName: string | null;
    templateType?: 'achievement_certificate' | 'hours_log';
    primaryColor: string;
    accentColor: string;
    isSystemPreset: boolean;
    titleText?: string;
    signatoryName?: string;
    signatoryTitle?: string;
}

export interface CertificateTemplateDetail {
    id: string;
    name: string;
    description: string;
    organizationId: string | null;
    organizationName: string | null;
    templateType: 'achievement_certificate' | 'hours_log';
    logoFileKey: string | null;
    backgroundFileKey: string | null;
    primaryColor: string;
    accentColor: string;
    titleText: string | null;
    bodyTemplate: string | null;
    signatoryName: string | null;
    signatoryTitle: string | null;
    isActive: boolean;
}

export interface GenerateCertificateResult {
    fileKey: string;
    downloadUrl: string;
    fileName: string;
    certificateId: string;
    verifyUrl: string;
}

export interface IssueCertificateResult {
    certificateId: string;
    verifyUrl: string;
}

export interface CertificateVerificationRecord {
    certificateId: string;
    isValid: boolean;
    isRevoked: boolean;
    revokedAt: string | null;
    volunteerName: string;
    organizationName: string;
    templateName: string;
    templateType: 'achievement_certificate' | 'hours_log';
    totalHours: number;
    completedOpportunities: number;
    issuedAt: string;
    signatoryName: string | null;
    signatoryTitle: string | null;
    fileName: string | null;
}

export const certificateService = {
    // Get all available templates (system presets + org-specific)
    getTemplates: async (organizationId?: string): Promise<CertificateTemplate[]> => {
        const params = organizationId ? `?organizationId=${organizationId}` : '';
        const res = await api.get<CertificateTemplate[]>(`/api/certificates/templates${params}`);
        return res.data;
    },

    // Get a single template detail
    getTemplate: async (templateId: string): Promise<CertificateTemplateDetail> => {
        const res = await api.get<CertificateTemplateDetail>(`/api/certificates/templates/${templateId}`);
        return res.data;
    },

    // Create a new custom template (for organizations)
    createTemplate: async (data: {
        name: string;
        description?: string;
        organizationId?: string;
        organizationName?: string;
        templateType?: 'achievement_certificate' | 'hours_log';
        logoFileKey?: string;
        backgroundFileKey?: string;
        primaryColor?: string;
        accentColor?: string;
        titleText?: string;
        bodyTemplate?: string;
        signatoryName?: string;
        signatoryTitle?: string;
    }): Promise<{ id: string }> => {
        const res = await api.post<{ id: string }>('/api/certificates/templates', data);
        return res.data;
    },

    // Update an existing template
    updateTemplate: async (templateId: string, data: Partial<{
        name: string;
        description: string;
        logoFileKey: string;
        backgroundFileKey: string;
        primaryColor: string;
        accentColor: string;
        templateType: 'achievement_certificate' | 'hours_log';
        titleText: string;
        bodyTemplate: string;
        signatoryName: string;
        signatoryTitle: string;
    }>): Promise<void> => {
        await api.put(`/api/certificates/templates/${templateId}`, data);
    },

    // Delete a template
    deleteTemplate: async (templateId: string): Promise<void> => {
        await api.delete(`/api/certificates/templates/${templateId}`);
    },

    // Generate a certificate PDF
    generate: async (volunteerId: string, templateId: string): Promise<GenerateCertificateResult> => {
        const res = await api.post<GenerateCertificateResult>('/api/certificates/generate', {
            volunteerId,
            templateId,
        });
        return res.data;
    },

    // Issue an official certificate (creates verification record)
    issue: async (volunteerId: string, templateId: string, volunteerSignatureName?: string): Promise<IssueCertificateResult> => {
        const res = await api.post<IssueCertificateResult>('/api/certificates/issue', {
            volunteerId,
            templateId,
            volunteerSignatureName,
        });
        return res.data;
    },

    // Verify a certificate by ID
    verify: async (certificateId: string): Promise<CertificateVerificationRecord> => {
        const res = await api.get<CertificateVerificationRecord>(`/api/certificates/verify/${encodeURIComponent(certificateId)}`);
        return res.data;
    },

    // Seed system preset templates (admin only, call once)
    seedPresets: async (): Promise<string> => {
        const res = await api.post<string>('/api/certificates/seed-presets');
        return res.data;
    },
};

