import * as React from 'react';
import { TouchableOpacity, Text, StyleSheet, Image, View } from 'react-native';
import { AuthService } from '../services/AuthService';

export const GoogleSignInButton = () => {
    const handlePress = async () => {
        try {
            await AuthService.signInWithGoogle();
        } catch (error) {
            console.error('Sign in error:', error);
        }
    };

    return (
        <TouchableOpacity style={styles.button} onPress={handlePress}>
            <View style={styles.content}>
                <View style={[styles.logo, { backgroundColor: '#4285F4', borderRadius: 2 }]} />
                <Text style={styles.text}>Sign in with Google</Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        width: '100%',
        maxWidth: 320,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: 20,
        height: 20,
        marginRight: 12,
    },
    text: {
        color: '#000000',
        fontSize: 16,
        fontWeight: '600',
    },
});
