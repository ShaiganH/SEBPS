// Design tokens — mirror the Tailwind config used in the web frontend
export const C = {
  // Brand
  primary:      '#2563EB',  // blue-600
  primaryLight: '#EFF6FF',  // blue-50
  primaryDark:  '#1D4ED8',  // blue-700

  // Surfaces
  bg:       '#F8FAFC',  // slate-50
  surface:  '#FFFFFF',
  border:   '#F1F5F9',  // slate-100
  borderMd: '#E2E8F0',  // slate-200

  // Text
  text:     '#0F172A',  // slate-900
  textSub:  '#64748B',  // slate-500
  textMuted:'#94A3B8',  // slate-400

  // Semantic
  success:     '#10B981',  // emerald-500
  successBg:   '#ECFDF5',  // emerald-50
  successText: '#065F46',  // emerald-800

  warning:     '#D97706',  // amber-600
  warningBg:   '#FFFBEB',  // amber-50
  warningText: '#92400E',  // amber-800

  danger:      '#EF4444',  // red-500
  dangerBg:    '#FEF2F2',  // red-50
  dangerText:  '#991B1B',  // red-800

  amber:    '#F59E0B',
  violet:   '#7C3AED',
  emerald:  '#10B981',
}

export const S = {
  // Shared StyleSheet fragments
  surface: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
  },
  btnPrimary: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
}
