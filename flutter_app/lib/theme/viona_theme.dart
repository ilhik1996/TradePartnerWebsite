import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class VionaColors {
  static const background   = Color(0xFF0D1117);
  static const surface      = Color(0xFF161B22);
  static const surface2     = Color(0xFF1C2128);
  static const border       = Color(0xFF21262D);
  static const purple       = Color(0xFF8B5CF6);
  static const purpleDim    = Color(0xFF6D3FC8);
  static const teal         = Color(0xFF2DD4BF);
  static const gold         = Color(0xFFFBBF24);
  static const textPrimary  = Color(0xFFF0F6FC);
  static const textSecondary= Color(0xFF8B949E);
  static const success      = Color(0xFF3FB950);
  static const danger       = Color(0xFFF85149);
  static const warning      = Color(0xFFD29922);
}

class VionaTheme {
  static ThemeData get dark {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: VionaColors.background,
      colorScheme: const ColorScheme.dark(
        primary: VionaColors.purple,
        secondary: VionaColors.teal,
        surface: VionaColors.surface,
        background: VionaColors.background,
        error: VionaColors.danger,
        onPrimary: Colors.white,
        onSurface: VionaColors.textPrimary,
      ),
      textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme).copyWith(
        displayLarge: GoogleFonts.inter(
          fontSize: 48, fontWeight: FontWeight.w900, color: VionaColors.textPrimary,
          letterSpacing: -1.5,
        ),
        displayMedium: GoogleFonts.inter(
          fontSize: 36, fontWeight: FontWeight.w900, color: VionaColors.textPrimary,
          letterSpacing: -1.0,
        ),
        headlineLarge: GoogleFonts.inter(
          fontSize: 24, fontWeight: FontWeight.w800, color: VionaColors.textPrimary,
          letterSpacing: -0.5,
        ),
        headlineMedium: GoogleFonts.inter(
          fontSize: 20, fontWeight: FontWeight.w700, color: VionaColors.textPrimary,
        ),
        titleLarge: GoogleFonts.inter(
          fontSize: 17, fontWeight: FontWeight.w600, color: VionaColors.textPrimary,
        ),
        bodyLarge: GoogleFonts.inter(
          fontSize: 15, fontWeight: FontWeight.w400, color: VionaColors.textPrimary,
        ),
        bodyMedium: GoogleFonts.inter(
          fontSize: 13, fontWeight: FontWeight.w400, color: VionaColors.textSecondary,
        ),
        labelLarge: GoogleFonts.inter(
          fontSize: 15, fontWeight: FontWeight.w600, color: Colors.white,
        ),
      ),
      cardTheme: CardTheme(
        color: VionaColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: VionaColors.border, width: 1),
        ),
        elevation: 0,
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: VionaColors.surface2,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: VionaColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: VionaColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: VionaColors.purple, width: 1.5),
        ),
        hintStyle: const TextStyle(color: VionaColors.textSecondary, fontSize: 15),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: VionaColors.purple,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          minimumSize: const Size(double.infinity, 52),
          textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w700),
          elevation: 0,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: VionaColors.purple,
          side: const BorderSide(color: VionaColors.purple, width: 1.5),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          minimumSize: const Size(double.infinity, 52),
          textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: VionaColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        iconTheme: IconThemeData(color: VionaColors.textPrimary),
        titleTextStyle: TextStyle(
          color: VionaColors.textPrimary, fontSize: 17,
          fontWeight: FontWeight.w700, letterSpacing: -0.2,
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: VionaColors.surface,
        selectedItemColor: VionaColors.purple,
        unselectedItemColor: VionaColors.textSecondary,
        showUnselectedLabels: true,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      dividerTheme: const DividerThemeData(color: VionaColors.border, thickness: 1),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: VionaColors.surface2,
        contentTextStyle: const TextStyle(color: VionaColors.textPrimary, fontSize: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
