import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/viona_theme.dart';
import '../services/api_service.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _api = ApiService();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  int? _selectedCountry;
  List<dynamic> _countries = [];
  bool _loading = false;
  bool _loadingCountries = true;
  bool _obscure = true;
  bool _agree18 = false;
  bool _agreeTerms = false;
  bool _agreeAuto = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadCountries();
  }

  Future<void> _loadCountries() async {
    try {
      _countries = await _api.getCountries();
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load country list. Please check your connection and retry.');
    }
    if (mounted) setState(() => _loadingCountries = false);
  }

  Future<void> _register() async {
    final email = _emailCtrl.text.trim();
    final pw = _passwordCtrl.text;
    final confirm = _confirmCtrl.text;

    if (email.isEmpty || pw.isEmpty || _selectedCountry == null) { setState(() => _error = 'Fill all fields'); return; }
    if (pw != confirm) { setState(() => _error = 'Passwords do not match'); return; }
    if (!_agree18 || !_agreeTerms) { setState(() => _error = 'You must accept all required agreements'); return; }

    setState(() { _loading = true; _error = null; });
    try {
      await _api.register(
        email: email,
        password: pw,
        countryId: _selectedCountry,
        autoParticipate: _agreeAuto,
      );
      if (mounted) context.go('/dashboard');
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: VionaColors.background,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: const Text('Create account'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Error
              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: VionaColors.danger.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: VionaColors.danger.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: VionaColors.danger, size: 18),
                      const SizedBox(width: 8),
                      Expanded(child: Text(_error!, style: const TextStyle(color: VionaColors.danger, fontSize: 13))),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Country
              Text('Your country', style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 8),
              _loadingCountries
                ? const LinearProgressIndicator(color: VionaColors.purple)
                : DropdownButtonFormField<int>(
                    value: _selectedCountry,
                    dropdownColor: VionaColors.surface,
                    decoration: const InputDecoration(hintText: 'Select country'),
                    items: _countries.map((c) => DropdownMenuItem<int>(
                      value: c['id'] as int,
                      child: Text('${c['name']} (${c['currencySymbol']})'),
                    )).toList(),
                    onChanged: (v) => setState(() => _selectedCountry = v),
                  ),
              const SizedBox(height: 16),

              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  hintText: 'Email address',
                  prefixIcon: Icon(Icons.email_outlined),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passwordCtrl,
                obscureText: _obscure,
                decoration: InputDecoration(
                  hintText: 'Password (min. 8 characters)',
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _confirmCtrl,
                obscureText: _obscure,
                decoration: const InputDecoration(
                  hintText: 'Confirm password',
                  prefixIcon: Icon(Icons.lock_outline),
                ),
              ),
              const SizedBox(height: 24),

              // Consent checkboxes
              _ConsentRow(
                value: _agree18,
                onChanged: (v) => setState(() => _agree18 = v ?? false),
                text: 'I confirm I am 18 years of age or older',
                required: true,
              ),
              const SizedBox(height: 8),
              _ConsentRow(
                value: _agreeTerms,
                onChanged: (v) => setState(() => _agreeTerms = v ?? false),
                text: 'I agree to the Terms of Service and Privacy Policy',
                required: true,
              ),
              const SizedBox(height: 8),
              _ConsentRow(
                value: _agreeAuto,
                onChanged: (v) => setState(() => _agreeAuto = v ?? false),
                text: 'Enable auto-participate: deduct entry fee automatically each day when my balance allows (can be toggled off any time)',
                required: false,
              ),
              const SizedBox(height: 24),

              ElevatedButton(
                onPressed: _loading ? null : _register,
                style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 56)),
                child: _loading
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Create account', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(height: 16),
              Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text("Already have an account? ", style: Theme.of(context).textTheme.bodyMedium),
                    GestureDetector(
                      onTap: () => context.pop(),
                      child: const Text('Sign in', style: TextStyle(color: VionaColors.purple, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: VionaColors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: VionaColors.border),
                ),
                child: const Text(
                  'No purchase necessary. A free method of entry (AMOE) is always available. Void where prohibited.',
                  style: TextStyle(fontSize: 11, color: VionaColors.textSecondary),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ConsentRow extends StatelessWidget {
  final bool value;
  final ValueChanged<bool?> onChanged;
  final String text;
  final bool required;

  const _ConsentRow({
    required this.value,
    required this.onChanged,
    required this.text,
    required this.required,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Checkbox(
          value: value,
          onChanged: onChanged,
          activeColor: VionaColors.purple,
          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
        const SizedBox(width: 4),
        Expanded(
          child: GestureDetector(
            onTap: () => onChanged(!value),
            child: Padding(
              padding: const EdgeInsets.only(top: 11),
              child: RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: text,
                      style: const TextStyle(fontSize: 13, color: VionaColors.textPrimary),
                    ),
                    if (required) const TextSpan(
                      text: ' *',
                      style: TextStyle(color: VionaColors.danger, fontSize: 13),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
