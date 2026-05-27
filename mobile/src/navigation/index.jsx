import { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import {
  LayoutDashboard, FileText, Cpu, Bell, MoreHorizontal,
} from 'lucide-react-native'
import { useAuth } from '../context/AuthContext'
import { C } from '../theme'

// Auth screens
import LoginScreen    from '../screens/auth/LoginScreen'
import RegisterScreen from '../screens/auth/RegisterScreen'

// Main screens
import DashboardScreen       from '../screens/DashboardScreen'
import BillsScreen           from '../screens/BillsScreen'
import IoTScreen             from '../screens/IoTScreen'
import NotificationsScreen   from '../screens/NotificationsScreen'
import MoreScreen            from '../screens/MoreScreen'

// Nested / "More" screens
import PredictionsScreen     from '../screens/PredictionsScreen'
import BudgetScreen          from '../screens/BudgetScreen'
import AppliancesScreen      from '../screens/AppliancesScreen'
import RecommendationsScreen from '../screens/RecommendationsScreen'
import OcrScreen             from '../screens/OcrScreen'
import ProfileScreen         from '../screens/ProfileScreen'

const Stack = createNativeStackNavigator()
const Tab   = createBottomTabNavigator()

// Unread count is passed down via route params from Layout — simpler than a global store
function TabBarIcon({ Icon, color, size, unread }) {
  return (
    <View>
      <Icon size={size} color={color} strokeWidth={1.8} />
      {unread > 0 && (
        <View style={{
          position: 'absolute', top: -4, right: -6,
          backgroundColor: C.danger, borderRadius: 8,
          minWidth: 14, height: 14,
          alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 3,
        }}>
          <View><ActivityIndicator /></View>
        </View>
      )}
    </View>
  )
}

// Bottom tabs — Dashboard, Bills, IoT, Notifications, More
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:   C.primary,
        tabBarInactiveTintColor: C.textMuted,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor:  C.border,
          borderTopWidth:  1,
          height:          62,
          paddingBottom:   8,
          paddingTop:      6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardStack}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tab.Screen
        name="BillsTab"
        component={BillsStack}
        options={{
          title: 'Bills',
          tabBarIcon: ({ color, size }) => <FileText size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tab.Screen
        name="IoTTab"
        component={IoTStack}
        options={{
          title: 'IoT',
          tabBarIcon: ({ color, size }) => <Cpu size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tab.Screen
        name="NotificationsTab"
        component={NotificationsScreen}
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => <Bell size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tab.Screen
        name="MoreTab"
        component={MoreStack}
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <MoreHorizontal size={size} color={color} strokeWidth={1.8} />,
        }}
      />
    </Tab.Navigator>
  )
}

// Per-tab stacks so "More" screens have a back button

function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={screenOpts}>
      <Stack.Screen name="Dashboard"  component={DashboardScreen}  options={{ title: 'Dashboard' }} />
    </Stack.Navigator>
  )
}

function BillsStack() {
  return (
    <Stack.Navigator screenOptions={screenOpts}>
      <Stack.Screen name="Bills"      component={BillsScreen}      options={{ title: 'Bills' }} />
      <Stack.Screen name="OcrScreen"  component={OcrScreen}        options={{ title: 'OCR Scan' }} />
    </Stack.Navigator>
  )
}

function IoTStack() {
  return (
    <Stack.Navigator screenOptions={screenOpts}>
      <Stack.Screen name="IoT"        component={IoTScreen}        options={{ title: 'IoT Devices' }} />
    </Stack.Navigator>
  )
}

function MoreStack() {
  return (
    <Stack.Navigator screenOptions={screenOpts}>
      <Stack.Screen name="More"                  component={MoreScreen}            options={{ title: 'More' }} />
      <Stack.Screen name="PredictionsScreen"     component={PredictionsScreen}     options={{ title: 'Predictions' }} />
      <Stack.Screen name="BudgetScreen"          component={BudgetScreen}          options={{ title: 'Budget' }} />
      <Stack.Screen name="AppliancesScreen"      component={AppliancesScreen}      options={{ title: 'Appliances' }} />
      <Stack.Screen name="RecommendationsScreen" component={RecommendationsScreen} options={{ title: 'Recommendations' }} />
      <Stack.Screen name="OcrScreen"             component={OcrScreen}             options={{ title: 'OCR Scan' }} />
      <Stack.Screen name="ProfileScreen"         component={ProfileScreen}         options={{ title: 'Profile & Settings' }} />
    </Stack.Navigator>
  )
}

// Shared header style
const screenOpts = {
  headerStyle:       { backgroundColor: '#fff' },
  headerShadowVisible: false,
  headerTitleStyle:  { fontSize: 17, fontWeight: '700', color: C.text },
  headerTintColor:   C.primary,
  contentStyle:      { backgroundColor: C.bg },
}

// Auth stack
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login"    component={LoginScreen}    />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  )
}

// Root navigator — switches between Auth and Main based on login state
export default function AppNavigator() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      {user ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  )
}
