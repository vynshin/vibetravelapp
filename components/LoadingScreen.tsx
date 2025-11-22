
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Svg, Path, Circle } from 'react-native-svg';

interface LoadingScreenProps {
  status: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ status }) => {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Spinning animation
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    ).start();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.loaderContainer}>
        <View style={styles.outerBorder} />
        <Animated.View style={[styles.spinnerBorder, { transform: [{ rotate: spin }] }]} />
        <Animated.View style={[styles.innerContent, { transform: [{ scale: pulseAnim }] }]}>
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth={2}>
            <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <Circle cx={12} cy={10} r={3} />
          </Svg>
        </Animated.View>
      </View>
      
      <Text style={styles.title}>VibeCheck AI</Text>
      <Animated.Text style={[styles.status, { opacity: pulseAnim }]}>
        {status}
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loaderContainer: {
    width: 96,
    height: 96,
    marginBottom: 32,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerBorder: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderWidth: 4,
    borderColor: '#1e293b',
    borderRadius: 16,
  },
  spinnerBorder: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderWidth: 4,
    borderTopColor: '#6366f1',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRadius: 16,
  },
  innerContent: {
    width: 64,
    height: 64,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  status: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
});
