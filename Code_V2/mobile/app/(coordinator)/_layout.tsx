import { Tabs } from 'expo-router';
import { COLORS } from '../../constants/config';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AIAssistant from '../../components/AIAssistant';

export default function OrganizationLayout() {
    return (
        <>
        <Tabs
            screenOptions={{
                headerStyle: { backgroundColor: COLORS.surface },
                headerTintColor: COLORS.text,
                tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border },
                tabBarActiveTintColor: COLORS.primary,
                tabBarInactiveTintColor: COLORS.textSecondary,
            }}
        >
            <Tabs.Screen
                name="dashboard"
                options={{
                    title: 'Dashboard',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="opportunities"
                options={{
                    title: 'Events',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="calendar-star" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="applications"
                options={{
                    title: 'Approvals',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="clipboard-check" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="members"
                options={{
                    title: 'Members',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-group" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="certificates"
                options={{
                    title: 'Certs',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="certificate" size={size} color={color} />,
                }}
            />
        </Tabs>
            <AIAssistant userRole="coordinator" />
        </>
    );
}
