import Foundation
import LocalAuthentication

let executable = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
let configURL = executable.deletingLastPathComponent().appendingPathComponent("auth-config.json")
if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--install" {
    let id = CommandLine.arguments[2]
    guard id.range(of: "^[a-p]{32}$", options: .regularExpression) != nil else { exit(1) }
    do {
        let origin = "chrome-extension://\(id)/"
        let config: [String: Any] = ["allowed_origin": origin]
        try JSONSerialization.data(withJSONObject: config).write(to: configURL, options: .atomic)
        let root = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Google/Chrome/NativeMessagingHosts")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let manifest: [String: Any] = [
            "name": "org.simpletablock.auth", "description": "Simple Tab Lock device authentication",
            "path": executable.path, "type": "stdio", "allowed_origins": [origin]
        ]
        try JSONSerialization.data(withJSONObject: manifest).write(
            to: root.appendingPathComponent("org.simpletablock.auth.json"), options: .atomic)
        print("Helper macOS terpasang. Reload ekstensi dan halaman pengelola di Chrome.")
        exit(0)
    } catch {
        FileHandle.standardError.write(Data("Installer gagal: \(error.localizedDescription)\n".utf8))
        exit(1)
    }
}
let config = (try? Data(contentsOf: configURL)).flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: String]
let allowedOrigin = config?["allowed_origin"]
let input = FileHandle.standardInput
let output = FileHandle.standardOutput

func readExactly(_ count: Int) -> Data? {
    var data = Data()
    while data.count < count {
        guard let part = try? input.read(upToCount: count - data.count), !part.isEmpty else { return nil }
        data.append(part)
    }
    return data
}

func send(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
    var length = UInt32(data.count).littleEndian
    output.write(Data(bytes: &length, count: 4))
    output.write(data)
}

guard let allowedOrigin = allowedOrigin,
      allowedOrigin.range(of: "^chrome-extension://[a-p]{32}/$", options: .regularExpression) != nil,
      CommandLine.arguments.dropFirst().first == allowedOrigin else {
    send(["error": "Extension origin is not allowed."])
    exit(1)
}
guard let header = readExactly(4) else { exit(1) }
let length = header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self).littleEndian }
guard length > 0, length <= 65536, let body = readExactly(Int(length)),
      let message = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any],
      let action = message["action"] as? String,
      ["status", "authenticate", "confirm-no-password"].contains(action) else {
    send(["error": "Invalid authentication request."])
    exit(1)
}

let context = LAContext()
context.touchIDAuthenticationAllowableReuseDuration = 0
context.localizedCancelTitle = "Cancel"
var policyError: NSError?
let available = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &policyError)
let noPassword = policyError?.domain == LAError.errorDomain && policyError?.code == LAError.passcodeNotSet.rawValue

if action == "status" {
    if available { send(["passwordRequired": true, "platform": "macos"]) }
    else if noPassword { send(["passwordRequired": false, "platform": "macos"]) }
    else { send(["error": "macOS could not verify the device owner. \(policyError?.localizedDescription ?? "")"]) }
    exit(0)
}
if action == "confirm-no-password" {
    send(["noPassword": !available && noPassword])
    exit(0)
}
guard available, let count = message["count"] as? Int, count > 0, count <= 1000 else {
    send(["error": "Device authentication is unavailable or the selection count is invalid."])
    exit(1)
}

context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Remove protection from \(count) page(s) in Simple Tab Lock.") {
    success, error in
    if success { send(["authenticated": true]) }
    else { send(["error": error?.localizedDescription ?? "Authentication canceled."]) }
    context.invalidate()
    exit(0)
}
RunLoop.main.run()
