import { Tabs } from 'expo-router';
import { COLORS } from '../../constants/config';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AIAssistant from '../../components/AIAssistant';

export default function AdminLayout() {
    return (
        <>
        <Tabs
            screenOptions={{
                headerStyle: { backgroundColor: COLORS.surface },
                headerTintColor: COLORS.text,
                tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border },
                tabBarActiveTintColor: COLORS.secondary,
                tabBarInactiveTintColor: COLORS.textSecondary,
            }}
        >
            <Tabs.Screen
                name="organizations"
                options={{
                    title: 'Orgs',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="office-building" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="disputes"
                options={{
                    title: 'Disputes',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="alert-circle" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="users"
                options={{
                    title: 'Users',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account-group" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="skills"
                options={{
                    title: 'Skills',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="star-circle" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="system"
                options={{
                    title: 'System',
                    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="server" size={size} color={color} />,
                }}
            />
        </Tabs>
            <AIAssistant userRole="admin" />
        </>
    );
}
