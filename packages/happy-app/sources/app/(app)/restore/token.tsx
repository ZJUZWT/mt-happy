import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { RoundButton } from '@/components/RoundButton';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import { Modal } from '@/modal';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

const stylesheet = StyleSheet.create((theme) => ({
    scrollView: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    container: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    contentWrapper: {
        width: '100%',
        maxWidth: layout.maxWidth,
        paddingVertical: 24,
    },
    instructionText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        marginBottom: 20,
        ...Typography.default(),
    },
    textInput: {
        backgroundColor: theme.colors.input.background,
        padding: 16,
        borderRadius: 8,
        marginBottom: 24,
        fontFamily: 'IBMPlexMono-Regular',
        fontSize: 14,
        minHeight: 120,
        textAlignVertical: 'top',
        color: theme.colors.input.text,
    },
}));

export default function TokenLogin() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const auth = useAuth();
    const router = useRouter();
    const [tokenInput, setTokenInput] = useState('');

    const handleLogin = async () => {
        const trimmedToken = tokenInput.trim();

        if (!trimmedToken) {
            Modal.alert('Error', 'Please enter a token');
            return;
        }

        try {
            // Token login uses a dummy secret since we only have the token
            // The token itself is sufficient for API access
            await auth.login(trimmedToken, '');
            router.back();
        } catch (error) {
            console.error('Token login error:', error);
            Modal.alert('Error', 'Failed to login with the provided token. Please check and try again.');
        }
    };

    return (
        <ScrollView style={styles.scrollView}>
            <View style={styles.container}>
                <View style={styles.contentWrapper}>
                    <Text style={styles.instructionText}>
                        Paste your authentication token below to login directly.
                        You can get this token from another device's Settings → Copy Token.
                    </Text>

                    <TextInput
                        style={styles.textInput}
                        placeholder="eyJhbGciOiJFZERTQSJ9..."
                        placeholderTextColor={theme.colors.input.placeholder}
                        value={tokenInput}
                        onChangeText={setTokenInput}
                        autoCapitalize="none"
                        autoCorrect={false}
                        multiline={true}
                        numberOfLines={4}
                    />

                    <RoundButton
                        title="Login with Token"
                        action={handleLogin}
                    />
                </View>
            </View>
        </ScrollView>
    );
}
