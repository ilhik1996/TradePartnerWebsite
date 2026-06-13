import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

typedef WsMessageHandler = void Function(Map<String, dynamic> data);

class WebSocketService {
  static const String _wsUrl = String.fromEnvironment(
    'WS_URL',
    defaultValue: 'wss://viona.app/ws',
  );

  static final WebSocketService _instance = WebSocketService._internal();
  factory WebSocketService() => _instance;
  WebSocketService._internal();

  WebSocketChannel? _channel;
  Timer? _reconnectTimer;
  final List<WsMessageHandler> _handlers = [];
  bool _shouldConnect = false;

  void addHandler(WsMessageHandler handler) => _handlers.add(handler);
  void removeHandler(WsMessageHandler handler) => _handlers.remove(handler);

  void connect() {
    _shouldConnect = true;
    _doConnect();
  }

  void disconnect() {
    _shouldConnect = false;
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _channel = null;
  }

  void _doConnect() {
    try {
      _channel = WebSocketChannel.connect(Uri.parse(_wsUrl));
      _channel!.stream.listen(
        (raw) {
          try {
            final data = jsonDecode(raw as String) as Map<String, dynamic>;
            for (final h in List.from(_handlers)) {
              h(data);
            }
          } catch (_) {}
        },
        onDone: _scheduleReconnect,
        onError: (_) => _scheduleReconnect(),
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (!_shouldConnect) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), _doConnect);
  }
}
