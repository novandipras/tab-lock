using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Security.Principal;

internal static class BlankPassword {
    [StructLayout(LayoutKind.Sequential)]
    private struct UserInfo {
        public IntPtr Name, Password;
        public uint PasswordAge, Privilege;
        public IntPtr Home, Comment;
        public uint Flags;
        public IntPtr Script;
        public uint AuthFlags;
        public IntPtr FullName, UserComment, Parameters, Workstations;
        public uint LastLogon, LastLogoff, Expires, MaxStorage, UnitsPerWeek;
        public IntPtr LogonHours;
        public uint BadPasswordCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LockoutPolicy { public uint Duration, ObservationWindow, Threshold; }

    [DataContract]
    private sealed class Cache {
        [DataMember] public string Sid;
        [DataMember] public long ChangedAt;
        [DataMember] public bool Blank;
    }

    [DllImport("netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern uint NetUserGetInfo(string server, string user, uint level, out IntPtr info);
    [DllImport("netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern uint NetUserModalsGet(string server, uint level, out IntPtr info);
    [DllImport("netapi32.dll")]
    private static extern uint NetApiBufferFree(IntPtr info);

    internal static bool IsBlank(bool force) {
        // Never probe a domain/Microsoft/Entra account with an empty password.
        if (!string.Equals(Environment.UserDomainName, Environment.MachineName, StringComparison.OrdinalIgnoreCase)) return false;
        IntPtr data;
        if (NetUserGetInfo(null, Environment.UserName, 24, out data) != 0) return false;
        try { if (Marshal.ReadInt32(data) != 0) return false; }
        finally { NetApiBufferFree(data); }
        if (NetUserGetInfo(null, Environment.UserName, 3, out data) != 0) return false;
        UserInfo user;
        try { user = (UserInfo)Marshal.PtrToStructure(data, typeof(UserInfo)); }
        finally { NetApiBufferFree(data); }
        long changedAt = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds - user.PasswordAge;
        string sid;
        using (var identity = WindowsIdentity.GetCurrent()) sid = identity.User.Value;
        string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SimpleTabLock", "auth-status.json");
        if (!force) {
            try {
                var cache = Program.ReadJson<Cache>(File.ReadAllBytes(path));
                if (cache.Sid == sid && Math.Abs(cache.ChangedAt - changedAt) <= 2) return cache.Blank;
            } catch (IOException) { } catch (SerializationException) { }
        }
        // Avoid turning an existing failed sign-in or a one-attempt policy into an account lockout.
        if (user.BadPasswordCount != 0 || NetUserModalsGet(null, 3, out data) != 0) return false;
        LockoutPolicy policy;
        try { policy = (LockoutPolicy)Marshal.PtrToStructure(data, typeof(LockoutPolicy)); }
        finally { NetApiBufferFree(data); }
        if (policy.Threshold == 1) return false;
        IntPtr empty = Marshal.StringToHGlobalUni("");
        bool blank;
        try { blank = WindowsAuth.VerifyPassword(empty, true); }
        catch (System.ComponentModel.Win32Exception) { return false; }
        finally { Marshal.FreeHGlobal(empty); }
        try {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllBytes(path, Program.JsonBytes(new Cache { Sid = sid, ChangedAt = changedAt, Blank = blank }));
        } catch (IOException) { } catch (UnauthorizedAccessException) { }
        return blank;
    }
}
