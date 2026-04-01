import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TextInput as RNTextInput, KeyboardAvoidingView, Platform, Keyboard, TouchableOpacity } from 'react-native';
import { FAB, Portal, Modal, Text, IconButton, Surface, ActivityIndicator, Chip, Button } from 'react-native-paper';
import { COLORS } from '../constants/config';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import * as Location from 'expo-location';
import { aiService, AiChatMessage, AiClientLocation } from '../services/ai';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    streaming?: boolean;
    error?: boolean;
}

interface Props {
    userRole: 'volunteer' | 'coordinator' | 'admin';
    currentView?: string;
}

const SUGGESTIONS: Record<string, string[]> = {
    volunteer: [
        'Recommend opportunities based on my skills and location.',
        'Show my application statuses.',
        'Show my eligible attendance records and guide check in.'
    ],
    coordinator: [
        'Show latest pending applications for my org.',
        'Generate an on-site QR check-in code.',
        'Post an announcement.'
    ],
    admin: [
        'Show system runtime overview.',
        'Show pending organizations.',
        'Show pending disputes.'
    ],
};

function simulateStream(text: string, onChunk: (chunk: string) => void, onDone: () => void): () => void {
    let i = 0;
    const delay = Math.max(8, Math.min(20, 2000 / text.length));
    const timer = setInterval(() => {
        if (i < text.length) {
            onChunk(text[i]);
            i++;
        } else {
            clearInterval(timer);
            onDone();
        }
    }, delay);
    return () => clearInterval(timer);
}

function generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export default function AIAssistant({ userRole, currentView }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    
    // Location state
    const [clientLocation, setClientLocation] = useState<AiClientLocation | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);
    
    const scrollViewRef = useRef<ScrollView>(null);
    const cancelRef = useRef<(() => void) | null>(null);

    const scrollToBottom = () => {
        setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
    };

    const handleOpen = () => setIsOpen(true);
    
    const handleClose = () => {
        if (cancelRef.current) { cancelRef.current(); cancelRef.current = null; }
        setIsStreaming(false);
        setIsOpen(false);
    };

    const handleClearChat = () => {
        if (cancelRef.current) { cancelRef.current(); cancelRef.current = null; }
        setIsStreaming(false);
        setMessages([]);
        setInput('');
    };

    const handleCaptureLocation = async () => {
        setIsLocating(true);
        setLocationError(null);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setLocationError('Permission to access location was denied');
                setIsLocating(false);
                return;
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            setClientLocation({
                lat: Number(location.coords.latitude.toFixed(7)),
                lon: Number(location.coords.longitude.toFixed(7)),
                accuracyMeters: Number(location.coords.accuracy?.toFixed(1) || 0),
                capturedAtUtc: new Date().toISOString(),
                source: 'mobile_geolocation'
            });
        } catch (error: any) {
            setLocationError('Failed to get location');
        } finally {
            setIsLocating(false);
        }
    };

    const sendMessage = useCallback(async (userText: string) => {
        if (!userText.trim() || isStreaming) return;

        const userInput = userText.trim();
        const userMsg: Message = { id: generateId(), role: 'user', content: userInput };
        const assistantId = generateId();
        const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true };

        setMessages(prev => [...prev, userMsg, assistantMsg]);
        setInput('');
        setIsStreaming(true);
        Keyboard.dismiss();
        scrollToBottom();

        const onChunk = (chunk: string) => {
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + chunk } : m));
            scrollToBottom();
        };

        const onDone = () => {
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m));
            setIsStreaming(false);
            cancelRef.current = null;
        };

        try {
            const history: AiChatMessage[] = messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .slice(-12)
                .map(m => ({ role: m.role, content: m.content }));

            const res = await aiService.chat({
                messages: [...history, { role: 'user', content: userInput }],
                currentView,
                clientLocation: clientLocation ?? undefined,
            });

            const text = res.reply?.trim() || 'I could not generate a response.';
            const cancel = simulateStream(text, onChunk, onDone);
            cancelRef.current = cancel;
        } catch (error: any) {
            const backendError = error?.response?.data?.error || error?.message || 'AI service unavailable.';
            const fallback = `⚠️ Failed to get live data.\n\nError: ${backendError}`;
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fallback, streaming: false, error: true } : m));
            setIsStreaming(false);
            cancelRef.current = null;
            scrollToBottom();
        }
    }, [isStreaming, messages, currentView, clientLocation]);

    const handleRetry = (errorMsgId: string) => {
        const idx = messages.findIndex(m => m.id === errorMsgId);
        if (idx <= 0) return;
        const lastUserMsg = messages.slice(0, idx).reverse().find(m => m.role === 'user');
        if (!lastUserMsg) return;
        setMessages(prev => prev.filter(m => m.id !== errorMsgId));
        setTimeout(() => sendMessage(lastUserMsg.content), 100);
    };

    const suggestions = SUGGESTIONS[userRole] || SUGGESTIONS.volunteer;

    return (
        <>
            <FAB
                icon="robot-outline"
                color="#fff"
                style={[styles.fab, { display: isOpen ? 'none' : 'flex' }]}
                onPress={handleOpen}
                animated={false}
            />

            <Portal>
                <Modal visible={isOpen} onDismiss={handleClose} contentContainerStyle={styles.modalContent}>
                    <KeyboardAvoidingView 
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        style={{ flex: 1 }}
                    >
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={styles.headerTitleContainer}>
                                <View style={styles.botIconContainer}>
                                    <MaterialCommunityIcons name="robot" size={20} color="#fff" />
                                </View>
                                <View>
                                    <Text style={styles.headerTitle}>AI Assistant</Text>
                                    <Text style={styles.headerSub}>Powered by VSMS · {userRole}</Text>
                                </View>
                            </View>
                            <View style={styles.headerActions}>
                                <IconButton icon="trash-can-outline" size={20} onPress={handleClearChat} disabled={messages.length === 0} iconColor={COLORS.error} />
                                <IconButton icon="close" size={24} onPress={handleClose} iconColor={COLORS.textSecondary} />
                            </View>
                        </View>

                        {/* Messages Area */}
                        <ScrollView 
                            ref={scrollViewRef} 
                            style={styles.messagesContainer}
                            contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 16 }}
                            keyboardShouldPersistTaps="handled"
                        >
                            {messages.length === 0 && (
                                <View style={styles.messageRowAssistant}>
                                    <View style={[styles.botIconContainer, { width: 24, height: 24, borderRadius: 12 }]} />
                                    <View style={styles.messageBubbleAssistant}>
                                        <Text style={styles.messageTextAssistant}>Hi! I'm your VSMS assistant. How can I help you today?</Text>
                                    </View>
                                </View>
                            )}

                            {messages.map(msg => (
                                <View key={msg.id} style={msg.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant}>
                                    {msg.role === 'assistant' && (
                                        <View style={[styles.botIconContainer, { width: 24, height: 24, borderRadius: 12, marginTop: 4 }]} />
                                    )}
                                    <View style={[
                                        msg.role === 'user' ? styles.messageBubbleUser : styles.messageBubbleAssistant,
                                        msg.error && styles.messageBubbleError
                                    ]}>
                                        {msg.role === 'assistant' && msg.streaming && !msg.content ? (
                                            <ActivityIndicator size="small" color={COLORS.primary} style={{ margin: 4 }} />
                                        ) : msg.role === 'assistant' ? (
                                            <Markdown style={markdownStyles}>
                                                {msg.content}
                                            </Markdown>
                                        ) : (
                                            <Text style={styles.messageTextUser}>{msg.content}</Text>
                                        )}
                                        
                                        {msg.error && !isStreaming && (
                                            <Button compact mode="contained" onPress={() => handleRetry(msg.id)} buttonColor={COLORS.error} style={{ marginTop: 8 }}>
                                                Retry
                                            </Button>
                                        )}
                                    </View>
                                </View>
                            ))}
                        </ScrollView>

                        {/* Input Area */}
                        <Surface style={styles.inputArea} elevation={4}>
                            {/* Location & Quick Actions */}
                            <View style={styles.quickActionsRow}>
                                <TouchableOpacity onPress={handleCaptureLocation} disabled={isLocating || isStreaming} style={[styles.locationBtn, locationError && { borderColor: COLORS.error }]}>
                                    <MaterialCommunityIcons name={locationError ? "map-marker-alert" : "map-marker-radius"} size={14} color={locationError ? COLORS.error : COLORS.textSecondary} />
                                    <Text style={{ fontSize: 11, color: locationError ? COLORS.error : COLORS.textSecondary, marginLeft: 4 }}>
                                        {isLocating ? 'Locating...' : clientLocation ? 'Location Set' : 'Use My Location'}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* Suggestions */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsScroll} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                                {suggestions.map((s, i) => (
                                    <Chip 
                                        key={i} 
                                        onPress={() => sendMessage(s)} 
                                        disabled={isStreaming}
                                        style={styles.suggestionChip}
                                        textStyle={styles.suggestionText}
                                        compact
                                    >
                                        {s}
                                    </Chip>
                                ))}
                            </ScrollView>

                            {/* Chat Input */}
                            <View style={styles.inputContainer}>
                                <RNTextInput
                                    value={input}
                                    onChangeText={setInput}
                                    placeholder="Ask anything about VSMS..."
                                    placeholderTextColor={COLORS.textSecondary}
                                    style={styles.textInput}
                                    multiline
                                    maxLength={500}
                                    editable={!isStreaming}
                                />
                                <IconButton 
                                    icon="send" 
                                    size={24} 
                                    iconColor={COLORS.primary} 
                                    onPress={() => sendMessage(input)}
                                    disabled={!input.trim() || isStreaming}
                                    style={styles.sendBtn}
                                />
                            </View>
                        </Surface>
                    </KeyboardAvoidingView>
                </Modal>
            </Portal>
        </>
    );
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 140, // Elevated to avoid overlapping with screen-level standard FABs
        backgroundColor: '#f97316', // Orange matching web gradient
    },
    modalContent: {
        backgroundColor: COLORS.background,
        margin: 16,
        borderRadius: 24,
        flex: 1,
        maxHeight: '85%',
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.surface,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    headerTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerActions: { flexDirection: 'row', alignItems: 'center', marginRight: -8 },
    botIconContainer: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: '#f97316',
        alignItems: 'center', justifyContent: 'center'
    },
    headerTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
    headerSub: { fontSize: 11, color: COLORS.textSecondary, textTransform: 'capitalize' },
    messagesContainer: {
        flex: 1,
        backgroundColor: COLORS.surfaceLight,
    },
    messageRowAssistant: { flexDirection: 'row', justifyContent: 'flex-start', maxWidth: '85%' },
    messageRowUser: { flexDirection: 'row', justifyContent: 'flex-end', width: '100%' },
    messageBubbleAssistant: {
        backgroundColor: COLORS.surface,
        padding: 12,
        borderRadius: 16,
        borderTopLeftRadius: 4,
        marginLeft: 8,
        borderWidth: 1,
        borderColor: COLORS.border,
        flexShrink: 1,
    },
    messageBubbleUser: {
        backgroundColor: '#f97316',
        padding: 12,
        borderRadius: 16,
        borderBottomRightRadius: 4,
        maxWidth: '85%',
    },
    messageBubbleError: {
        backgroundColor: '#fee2e2',
        borderColor: '#fca5a5',
    },
    messageTextAssistant: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
    messageTextUser: { fontSize: 14, color: '#fff', lineHeight: 20 },
    
    inputArea: {
        backgroundColor: COLORS.surface,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        paddingBottom: Platform.OS === 'ios' ? 8 : 16,
    },
    quickActionsRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 8,
        alignItems: 'center',
    },
    locationBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 6,
    },
    suggestionsScroll: { flexGrow: 0, paddingVertical: 8 },
    suggestionChip: { backgroundColor: COLORS.surfaceLight, borderColor: COLORS.border, borderWidth: 1 },
    suggestionText: { fontSize: 11, color: COLORS.textSecondary },
    
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
    },
    textInput: {
        flex: 1,
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 10,
        maxHeight: 120,
        color: COLORS.text,
        fontSize: 14,
        minHeight: 40,
        marginBottom: 8,
    },
    sendBtn: { marginBottom: 2 },
});

// react-native-markdown-display styles
const markdownStyles = {
    body: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
    paragraph: { marginBottom: 8, marginTop: 0 },
    code_inline: { backgroundColor: '#f4f4f5', color: '#f97316', borderRadius: 4, paddingHorizontal: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    code_block: { backgroundColor: '#f4f4f5', borderRadius: 8, padding: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    link: { color: '#f97316', textDecorationLine: 'underline' as const },
    heading1: { fontSize: 18, fontWeight: 'bold' as const, marginVertical: 8 },
    heading2: { fontSize: 16, fontWeight: 'bold' as const, marginVertical: 6 },
    heading3: { fontSize: 14, fontWeight: 'bold' as const, marginVertical: 4 },
    list_item: { marginBottom: 4 },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
};
