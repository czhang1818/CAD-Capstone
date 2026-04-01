import { OpportunityStatus, ApprovalPolicy } from './enums';

export interface Shift {
    shiftId: string;
    name: string;
    startTime: string;
    endTime: string;
    maxCapacity: number;
    currentCount: number;
}

export interface BasicInfo {
    title: string;
    description: string;
    category: string;
    tags: string[];
}

export interface GeoFenceSettings {
    latitude: number;
    longitude: number;
    radiusMeters: number;
}

export interface OpportunityState {
    info: BasicInfo;
    shifts: Shift[];
    geoFence: GeoFenceSettings | null;
    policy: ApprovalPolicy;
    waitlistQueue: string[];
    confirmedVolunteerIds: string[];
    requiredSkillIds: string[];
    status: OpportunityStatus;
    organizationId: string;
    createdAt: string;
}

export interface OpportunitySummary {
    opportunityId: string;
    organizationId: string;
    organizationName: string;
    title: string;
    category: string;
    status: OpportunityStatus;
    publishDate: string;
    totalSpots: number;
    availableSpots: number;
    latitude: number | null;
    longitude: number | null;
    requiredSkillIds: string[] | null;
}

export interface OpportunityRecommendation extends OpportunitySummary {
    matchedSkillCount: number;
    requiredSkillCount: number;
    skillMatchRatio: number;
    distanceKm: number | null;
    recommendationScore: number;
}

export interface OpportunityRecommendationResult {
    volunteerSkillCount: number;
    opportunities: OpportunityRecommendation[];
}

export interface OpportunityRecommendation extends OpportunitySummary {
    distanceKm: number | null;
    recommendationScore: number;
    matchedSkillCount: number;
    requiredSkillCount: number;
}

export interface OpportunityRecommendationResult {
    opportunities: OpportunityRecommendation[];
    volunteerSkillCount: number;
}
