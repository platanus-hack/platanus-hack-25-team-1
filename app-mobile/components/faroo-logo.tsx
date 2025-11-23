import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Text as SvgText, G, Defs, LinearGradient, Stop } from 'react-native-svg';

interface FarooLogoProps {
  width?: number;
  height?: number;
  showText?: boolean;
}

export function FarooLogo({ width = 200, height = 60, showText = true }: FarooLogoProps) {
  return (
    <View style={styles.container}>
      <Svg width={width} height={height} viewBox="0 0 200 60">
        <Defs>
          <LinearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#667eea" stopOpacity="1" />
            <Stop offset="100%" stopColor="#764ba2" stopOpacity="1" />
          </LinearGradient>
        </Defs>

        <G>
          {/* Símbolo ⛯ estilizado */}
          <G transform="translate(10, 10)">
            {/* Círculo exterior */}
            <Path
              d="M 20 5 A 15 15 0 1 1 20 35 A 15 15 0 1 1 20 5"
              fill="none"
              stroke="url(#logoGradient)"
              strokeWidth="3"
            />

            {/* Líneas del símbolo de navegación */}
            <Path
              d="M 20 10 L 20 30 M 15 20 L 25 20"
              stroke="url(#logoGradient)"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Triángulo direccional */}
            <Path
              d="M 20 8 L 15 15 L 25 15 Z"
              fill="url(#logoGradient)"
            />
          </G>

          {/* Texto "Faroo" */}
          {showText && (
            <>
              <SvgText
                x="55"
                y="32"
                fontSize="32"
                fontWeight="bold"
                fill="#ffffff"
                fontFamily="System"
              >
                Faro
              </SvgText>

              {/* Versión "v2" */}
              <SvgText
                x="150"
                y="28"
                fontSize="18"
                fontWeight="600"
                fill="#667eea"
                fontFamily="System"
              >
                v2
              </SvgText>
            </>
          )}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
