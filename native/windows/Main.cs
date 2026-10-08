using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text.RegularExpressions;

[DataContract]
internal sealed class Request {
    [DataMember(Name = "action")] public string Action;
    [DataMember(Name = "count")] public int Count;
}

[DataContract]
internal sealed class HostConfig {
    [DataMember(Name = "allowed_origin")] public string Origin;
}

internal static class Program {
    internal static T ReadJson<T>(byte[] bytes) {
        using (var stream = new MemoryStream(bytes))
            return (T)new DataContractJsonSerializer(typeof(T)).ReadObject(stream);
    }

    internal static byte[] JsonBytes<T>(T value) {
        using (var stream = new MemoryStream()) {
            var options = new DataContractJsonSerializerSettings { UseSimpleDictionaryFormat = true };
            new DataContractJsonSerializer(typeof(T), options).WriteObject(stream, value);
            return stream.ToArray();
        }
    }

    private static byte[] ReadExactly(Stream stream, int length) {
        var buffer = new byte[length];
        int offset = 0;
        while (offset < length) {
            int size = stream.Read(buffer, offset, length - offset);
            if (size == 0) throw new EndOfStreamException();
            offset += size;
        }
        return buffer;
    }

    private static void Reply(Dictionary<string, object> value) {
        byte[] data = JsonBytes(value);
        using (var stream = Console.OpenStandardOutput()) {
            byte[] length = BitConverter.GetBytes((uint)data.Length);
            stream.Write(length, 0, length.Length);
            stream.Write(data, 0, data.Length);
            stream.Flush();
        }
    }

    [STAThread]
    private static int Main(string[] args) {
        try {
            var config = ReadJson<HostConfig>(File.ReadAllBytes(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "auth-config.json")));
            if (config.Origin == null || !Regex.IsMatch(config.Origin, "^chrome-extension://[a-p]{32}/$") ||
                args.Length == 0 || args[0] != config.Origin) throw new Exception("Extension origin is not allowed.");
            Request request;
            using (var stream = Console.OpenStandardInput()) {
                uint length = BitConverter.ToUInt32(ReadExactly(stream, 4), 0);
                if (length == 0 || length > 65536) throw new Exception("Invalid message size.");
                request = ReadJson<Request>(ReadExactly(stream, (int)length));
            }
            if (request.Action == "status") {
                Reply(new Dictionary<string, object> {
                    { "passwordRequired", !BlankPassword.IsBlank(false) }, { "platform", "windows" }
                });
            } else if (request.Action == "confirm-no-password") {
                Reply(new Dictionary<string, object> { { "noPassword", BlankPassword.IsBlank(true) } });
            } else if (request.Action == "authenticate" && request.Count > 0 && request.Count <= 1000) {
                Reply(new Dictionary<string, object> { { "authenticated", WindowsAuth.Authenticate(request.Count) } });
            } else throw new Exception("Invalid authentication request.");
            return 0;
        } catch (Exception error) {
            Reply(new Dictionary<string, object> { { "error", error.Message } });
            return 1;
        }
    }
}
