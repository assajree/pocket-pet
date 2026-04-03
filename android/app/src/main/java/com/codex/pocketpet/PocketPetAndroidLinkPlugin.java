package com.codex.pocketpet;

import android.Manifest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "PocketPetAndroidLink",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "nearbyLegacy"),
        @Permission(
            strings = {
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE
            },
            alias = "nearby31"
        ),
        @Permission(
            strings = {
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.NEARBY_WIFI_DEVICES
            },
            alias = "nearby33"
        )
    }
)
public class PocketPetAndroidLinkPlugin extends Plugin {

    private static final Strategy STRATEGY = Strategy.P2P_STAR;
    private static final String SERVICE_ID = "com.codex.pocketpet.link";
    private static final String ENDPOINT_PREFIX = "PP";
    private static final String PAYLOAD_TYPE_SNAPSHOT = "snapshot";
    private static final String PAYLOAD_TYPE_COMPLETE = "complete";
    private static final String PAYLOAD_TYPE_CLOSE = "close";
    private static final String MODE_COMBAT = "combat";
    private static final String MODE_DATING = "dating";
    private static final long JOIN_TIMEOUT_MS = 20000L;
    private static final char[] CODE_SYMBOLS = new char[] { '<', '>', 'O' };

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final SecureRandom random = new SecureRandom();

    private ConnectionsClient connectionsClient;
    private LinkSession activeSession;
    private PluginCall pendingJoinCall;
    private PendingAction pendingPermissionAction;
    private Runnable joinTimeoutRunnable;
    private String pendingJoinCode;
    private String pendingJoinMode;

    @Override
    public void load() {
        connectionsClient = Nearby.getConnectionsClient(getContext());
    }

    @PluginMethod
    public void createSession(PluginCall call) {
        String mode = normalizeMode(call.getString("mode"));
        if (mode == null) {
            call.reject("Invalid mode.");
            return;
        }

        if (!ensurePermissions(call, PendingAction.CREATE_SESSION)) {
            return;
        }

        closeCurrentSession(false);

        LinkSession session = new LinkSession();
        session.code = generateCode();
        session.mode = mode;
        session.role = "host";
        activeSession = session;

        String endpointName = buildEndpointName(session.code, session.mode);
        AdvertisingOptions options = new AdvertisingOptions.Builder().setStrategy(STRATEGY).build();

        connectionsClient
            .startAdvertising(endpointName, SERVICE_ID, connectionLifecycleCallback, options)
            .addOnSuccessListener((unused) -> call.resolve(buildSessionResponse(session, false)))
            .addOnFailureListener((error) -> {
                activeSession = null;
                call.reject(error.getMessage() != null ? error.getMessage() : "Could not host link session.");
            });
    }

    @PluginMethod
    public void discoverOrJoin(PluginCall call) {
        String code = sanitizeCode(call.getString("code"));
        String expectedMode = normalizeMode(call.getString("expectedMode"));

        if (code.isEmpty()) {
            call.reject("Session code is required.");
            return;
        }

        if (expectedMode == null) {
            call.reject("Expected mode is required.");
            return;
        }

        if (!ensurePermissions(call, PendingAction.DISCOVER_OR_JOIN)) {
            return;
        }

        closeCurrentSession(false);
        cancelPendingJoin();

        LinkSession session = new LinkSession();
        session.code = code;
        session.mode = expectedMode;
        session.role = "join";
        activeSession = session;
        pendingJoinCall = call;
        pendingJoinCode = code;
        pendingJoinMode = expectedMode;

        DiscoveryOptions options = new DiscoveryOptions.Builder().setStrategy(STRATEGY).build();
        connectionsClient
            .startDiscovery(SERVICE_ID, endpointDiscoveryCallback, options)
            .addOnSuccessListener((unused) -> scheduleJoinTimeout())
            .addOnFailureListener((error) -> {
                cancelPendingJoin();
                activeSession = null;
                call.reject(error.getMessage() != null ? error.getMessage() : "Could not join link session.");
            });
    }

    @PluginMethod
    public void sendSnapshot(PluginCall call) {
        LinkSession session = requireMatchingSession(call);
        if (session == null) {
            return;
        }

        JSObject snapshot = call.getObject("snapshot");
        if (snapshot == null) {
            call.reject("Snapshot is required.");
            return;
        }

        session.localSnapshot = snapshot;
        if (!session.connected || session.remoteEndpointId == null) {
            call.resolve(okOnly());
            return;
        }

        JSONObject payload = new JSONObject();
        try {
            payload.put("type", PAYLOAD_TYPE_SNAPSHOT);
            payload.put("code", session.code);
            payload.put("role", session.role);
            payload.put("snapshot", snapshot);
        } catch (JSONException error) {
            call.reject("Snapshot payload is invalid.");
            return;
        }

        sendPayload(session.remoteEndpointId, payload, call, "Could not send snapshot.");
    }

    @PluginMethod
    public void pollOrSubscribeSession(PluginCall call) {
        LinkSession session = requireMatchingSession(call);
        if (session == null) {
            return;
        }

        JSObject response = buildSessionResponse(session, session.connected);
        response.put("joinConnected", session.connected);
        response.put("localSnapshotReceived", session.localSnapshot != null);
        response.put("remoteSnapshot", session.remoteSnapshot);
        call.resolve(response);
    }

    @PluginMethod
    public void completeSession(PluginCall call) {
        LinkSession session = requireMatchingSession(call);
        if (session == null) {
            return;
        }

        session.localComplete = true;

        if (session.connected && session.remoteEndpointId != null) {
            JSONObject payload = new JSONObject();
            try {
                payload.put("type", PAYLOAD_TYPE_COMPLETE);
                payload.put("code", session.code);
                payload.put("role", session.role);
            } catch (JSONException error) {
                call.reject("Completion payload is invalid.");
                return;
            }

            connectionsClient.sendPayload(session.remoteEndpointId, Payload.fromBytes(payload.toString().getBytes(StandardCharsets.UTF_8)))
                .addOnSuccessListener((unused) -> {
                    maybeCloseIfComplete(session);
                    call.resolve(okOnly());
                })
                .addOnFailureListener((error) -> {
                    maybeCloseIfComplete(session);
                    call.reject(error.getMessage() != null ? error.getMessage() : "Could not complete link session.");
                });
            return;
        }

        maybeCloseIfComplete(session);
        call.resolve(okOnly());
    }

    @PluginMethod
    public void closeSession(PluginCall call) {
        LinkSession session = activeSession;
        String code = sanitizeCode(call.getString("code"));
        if (session != null && session.code.equals(code) && session.connected && session.remoteEndpointId != null) {
            JSONObject payload = new JSONObject();
            try {
                payload.put("type", PAYLOAD_TYPE_CLOSE);
                payload.put("code", session.code);
            } catch (JSONException ignored) {
                // Ignore malformed close payload construction and just close locally.
            }

            if (payload.length() > 0) {
                connectionsClient.sendPayload(session.remoteEndpointId, Payload.fromBytes(payload.toString().getBytes(StandardCharsets.UTF_8)));
            }
        }

        closeCurrentSession(true);
        call.resolve(okOnly());
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        PendingAction action = pendingPermissionAction;
        pendingPermissionAction = null;

        if (action == null) {
            call.reject("Permission request state was lost.");
            return;
        }

        if (!hasNearbyPermissions()) {
            call.reject("Nearby permissions were denied.");
            return;
        }

        switch (action) {
            case CREATE_SESSION:
                createSession(call);
                return;
            case DISCOVER_OR_JOIN:
                discoverOrJoin(call);
                return;
            default:
                call.reject("Unknown permission callback action.");
        }
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        cancelPendingJoin();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        closeCurrentSession(true);
    }

    private boolean ensurePermissions(PluginCall call, PendingAction action) {
        if (hasNearbyPermissions()) {
            return true;
        }

        pendingPermissionAction = action;
        requestPermissionForAlias(getPermissionAlias(), call, "permissionsCallback");
        return false;
    }

    private boolean hasNearbyPermissions() {
        return getPermissionState(getPermissionAlias()) == PermissionState.GRANTED;
    }

    private String getPermissionAlias() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return "nearby33";
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return "nearby31";
        }
        return "nearbyLegacy";
    }

    private void scheduleJoinTimeout() {
        cancelJoinTimeout();
        joinTimeoutRunnable = () -> {
            PluginCall joinCall = pendingJoinCall;
            cancelPendingJoin();
            if (joinCall != null) {
                activeSession = null;
                joinCall.reject("Session not found.");
            }
        };
        mainHandler.postDelayed(joinTimeoutRunnable, JOIN_TIMEOUT_MS);
    }

    private void cancelJoinTimeout() {
        if (joinTimeoutRunnable != null) {
            mainHandler.removeCallbacks(joinTimeoutRunnable);
            joinTimeoutRunnable = null;
        }
    }

    private void cancelPendingJoin() {
        cancelJoinTimeout();
        try {
            connectionsClient.stopDiscovery();
        } catch (Exception ignored) {
        }
        pendingJoinCall = null;
        pendingJoinCode = null;
        pendingJoinMode = null;
    }

    private void closeCurrentSession(boolean clearSnapshots) {
        cancelPendingJoin();

        if (connectionsClient != null) {
            try {
                connectionsClient.stopAdvertising();
            } catch (Exception ignored) {
            }
            try {
                connectionsClient.stopDiscovery();
            } catch (Exception ignored) {
            }
        }

        LinkSession session = activeSession;
        if (session != null && session.remoteEndpointId != null) {
            try {
                connectionsClient.disconnectFromEndpoint(session.remoteEndpointId);
            } catch (Exception ignored) {
            }
        }

        if (clearSnapshots || session == null) {
            activeSession = null;
            return;
        }

        session.connected = false;
        session.remoteEndpointId = null;
        session.joinConnected = false;
    }

    private LinkSession requireMatchingSession(PluginCall call) {
        LinkSession session = activeSession;
        String code = sanitizeCode(call.getString("code"));
        String role = call.getString("role");

        if (session == null || !session.code.equals(code)) {
            call.reject("Session not found.");
            return null;
        }

        if (role != null && !role.equals(session.role)) {
            call.reject("Invalid role.");
            return null;
        }

        return session;
    }

    private void maybeCloseIfComplete(LinkSession session) {
        if (session.localComplete && session.remoteComplete) {
            closeCurrentSession(true);
        }
    }

    private void sendPayload(String endpointId, JSONObject payload, PluginCall call, String fallbackMessage) {
        connectionsClient.sendPayload(endpointId, Payload.fromBytes(payload.toString().getBytes(StandardCharsets.UTF_8)))
            .addOnSuccessListener((unused) -> {
                if (PAYLOAD_TYPE_SNAPSHOT.equals(payload.optString("type", "")) && activeSession != null) {
                    activeSession.localSnapshotSent = true;
                }
                call.resolve(okOnly());
            })
            .addOnFailureListener((error) -> call.reject(error.getMessage() != null ? error.getMessage() : fallbackMessage));
    }

    private JSObject buildSessionResponse(LinkSession session, boolean joinConnected) {
        JSObject response = okOnly();
        response.put("code", session.code);
        response.put("mode", session.mode);
        response.put("role", session.role);
        response.put("joinConnected", joinConnected);
        return response;
    }

    private JSObject okOnly() {
        JSObject response = new JSObject();
        response.put("ok", true);
        return response;
    }

    private String normalizeMode(String mode) {
        if (MODE_COMBAT.equals(mode) || MODE_DATING.equals(mode)) {
            return mode;
        }
        return null;
    }

    private String sanitizeCode(String code) {
        return code == null ? "" : code.trim().toUpperCase(Locale.US);
    }

    private String generateCode() {
        StringBuilder builder = new StringBuilder(6);
        for (int index = 0; index < 6; index += 1) {
            builder.append(CODE_SYMBOLS[random.nextInt(CODE_SYMBOLS.length)]);
        }
        return builder.toString();
    }

    private String buildEndpointName(String code, String mode) {
        return ENDPOINT_PREFIX + "|" + code + "|" + mode;
    }

    private ParsedEndpoint parseEndpointName(String endpointName) {
        if (endpointName == null) {
            return null;
        }

        String[] parts = endpointName.split("\\|");
        if (parts.length != 3 || !ENDPOINT_PREFIX.equals(parts[0])) {
            return null;
        }

        ParsedEndpoint parsed = new ParsedEndpoint();
        parsed.code = sanitizeCode(parts[1]);
        parsed.mode = normalizeMode(parts[2]);
        return parsed.mode == null ? null : parsed;
    }

    private final EndpointDiscoveryCallback endpointDiscoveryCallback = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(@NonNull String endpointId, @NonNull DiscoveredEndpointInfo discoveredEndpointInfo) {
            if (pendingJoinCall == null || activeSession == null) {
                return;
            }

            ParsedEndpoint parsed = parseEndpointName(discoveredEndpointInfo.getEndpointName());
            if (parsed == null || !parsed.code.equals(pendingJoinCode)) {
                return;
            }

            if (!parsed.mode.equals(pendingJoinMode)) {
                PluginCall joinCall = pendingJoinCall;
                JSObject payload = new JSObject();
                payload.put("hostMode", parsed.mode);
                cancelPendingJoin();
                activeSession = null;
                joinCall.reject("Mode mismatch: host is " + parsed.mode + ".", "MODE_MISMATCH", payload);
                return;
            }

            activeSession.mode = parsed.mode;
            activeSession.remoteEndpointId = endpointId;
            cancelJoinTimeout();
            connectionsClient.stopDiscovery();
            String localEndpointName = buildEndpointName(activeSession.code, activeSession.mode);
            connectionsClient
                .requestConnection(localEndpointName, endpointId, connectionLifecycleCallback)
                .addOnFailureListener((error) -> {
                    PluginCall joinCall = pendingJoinCall;
                    cancelPendingJoin();
                    activeSession = null;
                    if (joinCall != null) {
                        joinCall.reject(error.getMessage() != null ? error.getMessage() : "Could not join link session.");
                    }
                });
        }

        @Override
        public void onEndpointLost(@NonNull String endpointId) {
            if (activeSession != null && endpointId.equals(activeSession.remoteEndpointId)) {
                activeSession.connected = false;
                activeSession.joinConnected = false;
            }
        }
    };

    private final ConnectionLifecycleCallback connectionLifecycleCallback = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(@NonNull String endpointId, @NonNull ConnectionInfo connectionInfo) {
            ParsedEndpoint parsed = parseEndpointName(connectionInfo.getEndpointName());
            if (activeSession == null || parsed == null) {
                connectionsClient.rejectConnection(endpointId);
                return;
            }

            if (!activeSession.code.equals(parsed.code)) {
                connectionsClient.rejectConnection(endpointId);
                return;
            }

            if (!activeSession.mode.equals(parsed.mode)) {
                connectionsClient.rejectConnection(endpointId);
                return;
            }

            if (activeSession.remoteEndpointId != null && !activeSession.remoteEndpointId.equals(endpointId)) {
                connectionsClient.rejectConnection(endpointId);
                return;
            }

            activeSession.remoteEndpointId = endpointId;
            connectionsClient.acceptConnection(endpointId, payloadCallback);
        }

        @Override
        public void onConnectionResult(@NonNull String endpointId, @NonNull ConnectionResolution connectionResolution) {
            if (activeSession == null) {
                return;
            }

            if (connectionResolution.getStatus().isSuccess()) {
                activeSession.remoteEndpointId = endpointId;
                activeSession.connected = true;
                activeSession.joinConnected = true;
                sendStoredSnapshotIfReady(activeSession);

                if (pendingJoinCall != null) {
                    PluginCall joinCall = pendingJoinCall;
                    cancelPendingJoin();
                    joinCall.resolve(buildSessionResponse(activeSession, true));
                }
                return;
            }

            activeSession.connected = false;
            activeSession.joinConnected = false;
            if (pendingJoinCall != null) {
                PluginCall joinCall = pendingJoinCall;
                cancelPendingJoin();
                activeSession = null;
                joinCall.reject("Could not join link session.");
            }
        }

        @Override
        public void onDisconnected(@NonNull String endpointId) {
            if (activeSession == null || !endpointId.equals(activeSession.remoteEndpointId)) {
                return;
            }

            activeSession.connected = false;
            activeSession.joinConnected = false;
            activeSession.remoteEndpointId = null;
        }
    };

    private final PayloadCallback payloadCallback = new PayloadCallback() {
        @Override
        public void onPayloadReceived(@NonNull String endpointId, @NonNull Payload payload) {
            if (activeSession == null || payload.getType() != Payload.Type.BYTES || payload.asBytes() == null) {
                return;
            }

            try {
                JSONObject message = new JSONObject(new String(payload.asBytes(), StandardCharsets.UTF_8));
                String type = message.optString("type", "");
                String code = sanitizeCode(message.optString("code", ""));

                if (!activeSession.code.equals(code)) {
                    return;
                }

                if (PAYLOAD_TYPE_SNAPSHOT.equals(type)) {
                    JSONObject remoteSnapshot = message.optJSONObject("snapshot");
                    if (remoteSnapshot != null) {
                        activeSession.remoteSnapshot = new JSObject(remoteSnapshot.toString());
                    }
                    activeSession.connected = true;
                    activeSession.joinConnected = true;
                    return;
                }

                if (PAYLOAD_TYPE_COMPLETE.equals(type)) {
                    activeSession.remoteComplete = true;
                    maybeCloseIfComplete(activeSession);
                    return;
                }

                if (PAYLOAD_TYPE_CLOSE.equals(type)) {
                    closeCurrentSession(true);
                }
            } catch (JSONException ignored) {
                // Ignore malformed payloads so the local session can continue.
            }
        }

        @Override
        public void onPayloadTransferUpdate(@NonNull String endpointId, @NonNull PayloadTransferUpdate payloadTransferUpdate) {
            // This game only exchanges small BYTES payloads and polls state from JS.
        }
    };

    private void sendStoredSnapshotIfReady(LinkSession session) {
        if (session == null || !session.connected || session.remoteEndpointId == null || session.localSnapshot == null || session.localSnapshotSent) {
            return;
        }

        JSONObject payload = new JSONObject();
        try {
            payload.put("type", PAYLOAD_TYPE_SNAPSHOT);
            payload.put("code", session.code);
            payload.put("role", session.role);
            payload.put("snapshot", session.localSnapshot);
        } catch (JSONException ignored) {
            return;
        }

        connectionsClient.sendPayload(session.remoteEndpointId, Payload.fromBytes(payload.toString().getBytes(StandardCharsets.UTF_8)))
            .addOnSuccessListener((unused) -> session.localSnapshotSent = true)
            .addOnFailureListener((error) -> session.localSnapshotSent = false);
    }

    private enum PendingAction {
        CREATE_SESSION,
        DISCOVER_OR_JOIN
    }

    private static final class ParsedEndpoint {
        String code;
        String mode;
    }

    private static final class LinkSession {
        String code;
        String mode;
        String role;
        String remoteEndpointId;
        boolean connected;
        boolean joinConnected;
        boolean localComplete;
        boolean remoteComplete;
        boolean localSnapshotSent;
        JSObject localSnapshot;
        JSObject remoteSnapshot;
    }
}
