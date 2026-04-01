import { Tabs } from 'expo-router';
import { COLORS } from '../../constants/config';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AIAssistant from '../../components/AIAssistant';

export default function VolunteerLayout() {
    return (
        <>
        <Tabs
            screenOptions={{
                headerStyle: { backgroundColor: COLORS.surface },
                headerTintColor: COLORS.text,
                headerTitleStyle: { fontWeight: '700', fontSize: 17 },
                tabBarStyle: {
                    backgroundColor: COLORS.surface,
                    borderTopColor: COLORS.border,
                    borderTopWidth: 1,
                    height: 60,
                    paddingBottom: 8,
                },
                tabBarActiveTintColor: COLORS.primary,
                tabBarInactiveTintColor: COLORS.textSecondary,
                tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
                tabBarItemStyle: { flex: 1 },
            }}
        >
            <Tabs.Screen
                name="dashboard"
                options={{
                    title: 'Home',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="home"
                options={{
                    title: 'Explore',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="compass" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="my-applications"
                options={{
                    title: 'My Apps',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="clipboard-list" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="checkin"
                options={{
                    title: 'Check In',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="map-marker-check" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profile',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account" size={size} color={color} />,
                }}
            />
            {/* Hidden screens — accessible via router.push but not shown in tab bar */}
            <Tabs.Screen name="attendance" options={{ title: 'History', href: null }} />
            <Tabs.Screen name="skills" options={{ title: 'Skills', href: null }} />
            <Tabs.Screen name="organizations" options={{ title: 'Organizations', href: null }} />
            <Tabs.Screen name="opportunity-detail" options={{ title: 'Opportunity', href: null }} />
            <Tabs.Screen name="notifications" options={{ title: 'Notifications', href: null }} />
        </Tabs>
            <AIAssistant userRole="volunteer" />
        </>
    );
}
