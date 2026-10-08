using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

internal static class WindowsAuth {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CredentialInfo {
        public int Size;
        public IntPtr Parent;
        public string Message;
        public string Caption;
        public IntPtr Banner;
    }

    [DllImport("credui.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint CredUIPromptForCredentialsW(ref CredentialInfo info, string target, IntPtr context,
        uint error, StringBuilder user, uint userSize, IntPtr password, uint passwordSize, ref bool save, uint flags);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
    private static extern bool LogonUserW(string username, string domain, IntPtr password, uint logonType, uint provider, out IntPtr token);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    internal static bool VerifyPassword(IntPtr password, bool checkingBlank = false) {
        using (var current = WindowsIdentity.GetCurrent()) {
            string[] identity = current.Name.Split(new[] { '\\' }, 2);
            if (identity.Length != 2) throw new Exception("The Windows account identity could not be verified.");
            IntPtr token;
            bool valid = LogonUserW(identity[1], identity[0], password, 2, 0, out token);
            int error = Marshal.GetLastWin32Error();
            if (!valid) {
                // Windows validates credentials before reporting account restrictions, as Chromium's blank-password check uses.
                if (checkingBlank && error == 1327 && Marshal.ReadInt16(password) == 0) return true;
                if (error == 1326) return false;
                throw new Win32Exception(error, "Windows could not verify the current account.");
            }
            try {
                using (var verified = new WindowsIdentity(token)) return verified.User.Equals(current.User);
            } finally { CloseHandle(token); }
        }
    }

    internal static bool Authenticate(int count) {
        const int capacity = 513;
        IntPtr password = Marshal.AllocHGlobal(capacity * 2);
        try {
            for (int i = 0; i < capacity * 2; i++) Marshal.WriteByte(password, i, 0);
            using (var current = WindowsIdentity.GetCurrent()) {
                var info = new CredentialInfo {
                    Size = Marshal.SizeOf(typeof(CredentialInfo)), Caption = "Simple Tab Lock",
                    Message = string.Format("Enter your Windows account password to remove {0} page lock(s).", count)
                };
                var username = new StringBuilder(current.Name, capacity);
                bool save = false;
                // Request a fresh password for the current account, with no saved credentials.
                const uint flags = 0x40000 | 0x100000 | 0x80 | 0x2 | 0x8;
                uint result = CredUIPromptForCredentialsW(ref info, "Simple Tab Lock", IntPtr.Zero, 0,
                    username, capacity, password, capacity, ref save, flags);
                if (result == 1223) return false;
                if (result != 0) throw new Win32Exception((int)result, "The Windows authentication dialog failed.");
                if (!string.Equals(username.ToString(), current.Name, StringComparison.OrdinalIgnoreCase)) return false;
                return VerifyPassword(password);
            }
        } finally {
            for (int i = 0; i < capacity * 2; i++) Marshal.WriteByte(password, i, 0);
            Marshal.FreeHGlobal(password);
        }
    }
}
