import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Footer from "@/components/Footer";
import AppSidebarLayout from "@/components/AppSidebarLayout";
import { Loader2, ArrowLeft, Database, Download, RotateCcw, Trash2, Cloud, Inbox, Copy, Check, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface DataBackup {
  id: string;
  user_id: string;
  created_at: string;
  label: string | null;
  data: any;
}

interface BackupLogEntry {
  id: number;
  timestamp: string;
  action: "backup" | "restore" | "delete" | "download";
  details: string;
}
const DeveloperSettings = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [backups, setBackups] = useState<DataBackup[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [label, setLabel] = useState("");
  const [isRestoringId, setIsRestoringId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [selectedTables, setSelectedTables] = useState<Record<string, boolean>>({
    profiles: true,
    job_searches: true,
    candidate_matches: true,
    candidate_bookmarks: true,
    admin_profiles: true,
    external_submissions: true,
    admin_settings: true,
    two_factor_auth: true,
  });
  const [activityLog, setActivityLog] = useState<BackupLogEntry[]>([]);
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [driveFileId, setDriveFileId] = useState<string | null>(null);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isSyncingToDrive, setIsSyncingToDrive] = useState(false);
  const [isRestoringFromDrive, setIsRestoringFromDrive] = useState(false);
  const [syncToDrive, setSyncToDrive] = useState(false);
  const [isRestoringFromFile, setIsRestoringFromFile] = useState(false);
  
  // External submissions admin settings
  const [adminEmail, setAdminEmail] = useState("");
  const [isReceivingActive, setIsReceivingActive] = useState(true);
  const [hasAdminSettings, setHasAdminSettings] = useState(false);
  const [isSavingAdminSettings, setIsSavingAdminSettings] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      void loadBackups();
      void checkDriveConnection();
      void loadAdminSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadAdminSettings = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("admin_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error && data) {
      setAdminEmail(data.receiving_email || "");
      setIsReceivingActive(data.is_active);
      setHasAdminSettings(true);
    }
  };

  const saveAdminSettings = async () => {
    if (!user || !adminEmail.trim()) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingAdminSettings(true);
    try {
      if (hasAdminSettings) {
        // Update existing settings
        const { error } = await supabase
          .from("admin_settings")
          .update({
            receiving_email: adminEmail.toLowerCase().trim(),
            is_active: isReceivingActive,
          })
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        // Insert new settings
        const { error } = await supabase
          .from("admin_settings")
          .insert({
            user_id: user.id,
            receiving_email: adminEmail.toLowerCase().trim(),
            is_active: isReceivingActive,
          });

        if (error) throw error;
        setHasAdminSettings(true);
      }

      toast({
        title: "Settings saved",
        description: "External submission settings have been updated.",
      });
    } catch (err: any) {
      console.error("Error saving admin settings:", err);
      toast({
        title: "Failed to save settings",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSavingAdminSettings(false);
    }
  };

  const copyEndpointUrl = () => {
    const url = `https://olkbhjyfpdvcovtuekzt.supabase.co/functions/v1/receive-external-resume`;
    navigator.clipboard.writeText(url);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
    toast({
      title: "Copied!",
      description: "API endpoint URL copied to clipboard.",
    });
  };

  const checkDriveConnection = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("google_drive_backups")
      .select("drive_file_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error && data) {
      setIsDriveConnected(true);
      setDriveFileId(data.drive_file_id);
    }
  };

  const loadBackups = async () => {
    if (!user) return;
    setIsLoadingBackups(true);
    const { data, error } = await supabase
      .from("data_backups")
      .select("id, user_id, created_at, label")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading backups", error);
      toast({
        title: "Failed to load backups",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setBackups(data as DataBackup[]);
    }
    setIsLoadingBackups(false);
  };

  const addLog = (action: BackupLogEntry["action"], details: string) => {
    setActivityLog(prev => {
      const nextId = prev.length ? prev[0].id + 1 : 1;
      return [
        {
          id: nextId,
          timestamp: new Date().toLocaleString(),
          action,
          details,
        },
        ...prev,
      ];
    });
  };

  const createBackup = async () => {
    if (!user) return;

    const activeTables = Object.entries(selectedTables)
      .filter(([, isOn]) => isOn)
      .map(([key]) => key);

    if (activeTables.length === 0) {
      toast({
        title: "No tables selected",
        description: "Select at least one table to include in the backup.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingBackup(true);
    try {
      const snapshot: Record<string, any> = {};

      if (selectedTables.profiles) {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", user.id);
        if (error) throw error;
        snapshot.profiles = data;
      }

      if (selectedTables.job_searches) {
        const { data, error } = await supabase
          .from("job_searches")
          .select("*")
          .eq("user_id", user.id);
        if (error) throw error;
        snapshot.job_searches = data;
      }

      if (selectedTables.candidate_matches) {
        const { data, error } = await supabase
          .from("candidate_matches")
          .select("*");
        if (error) throw error;
        snapshot.candidate_matches = data;
      }

      if (selectedTables.candidate_bookmarks) {
        const { data, error } = await supabase
          .from("candidate_bookmarks")
          .select("*")
          .eq("user_id", user.id);
        if (error) throw error;
        snapshot.candidate_bookmarks = data;
      }

      if (selectedTables.admin_profiles) {
        const { data, error } = await supabase
          .from("admin_profiles")
          .select("*")
          .eq("user_id", user.id);
        if (error) throw error;
        snapshot.admin_profiles = data;
      }

      if (selectedTables.external_submissions) {
        const { data, error } = await supabase
          .from("external_submissions")
          .select("*")
          .eq("admin_user_id", user.id);
        if (error) throw error;
        snapshot.external_submissions = data;
      }

      if (selectedTables.admin_settings) {
        const { data, error } = await supabase
          .from("admin_settings")
          .select("*")
          .eq("user_id", user.id);
        if (error) throw error;
        snapshot.admin_settings = data;
      }

      if (selectedTables.two_factor_auth) {
        const { data, error } = await supabase
          .from("two_factor_auth")
          .select("*")
          .eq("user_id", user.id);
        if (error) throw error;
        snapshot.two_factor_auth = data;
      }

      const { error: insertError } = await supabase.from("data_backups").insert({
        user_id: user.id,
        label: label || null,
        data: snapshot,
      });

      if (insertError) throw insertError;

      toast({
        title: "Backup created",
        description: "Your data snapshot has been saved to the server.",
      });
      addLog(
        "backup",
        `Created backup${label ? ` "${label}"` : ""} with tables: ${activeTables.join(", ")}`,
      );
      setLabel("");
      void loadBackups();

      // If sync to Drive is enabled, upload to Drive as well
      if (syncToDrive && isDriveConnected) {
        void syncBackupToDrive();
      }
    } catch (err: any) {
      console.error("Error creating backup", err);
      toast({
        title: "Failed to create backup",
        description: err.message ?? "Unexpected error while creating backup.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };
  const downloadBackup = async (backupId: string) => {
    const { data, error } = await supabase
      .from("data_backups")
      .select("data, created_at, label")
      .eq("id", backupId)
      .maybeSingle();

    if (error || !data) {
      console.error("Error loading backup for download", error);
      toast({
        title: "Download failed",
        description: error?.message ?? "Backup not found.",
        variant: "destructive",
      });
      return;
    }

    const blob = new Blob([JSON.stringify(data.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date(data.created_at).toISOString().replace(/[:.]/g, "-");
    const safeLabel = data.label ? `-${data.label.replace(/[^a-z0-9]+/gi, "-")}` : "";
    a.href = url;
    a.download = `backup${safeLabel}-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);

    addLog("download", `Downloaded backup${data.label ? ` "${data.label}"` : ""}.`);
  };

  const restoreBackup = async (backupId: string) => {
    if (!user) return;
    setIsRestoringId(backupId);

    try {
      const { data, error } = await supabase
        .from("data_backups")
        .select("data, label")
        .eq("id", backupId)
        .maybeSingle();

      if (error || !data) {
        throw error ?? new Error("Backup not found");
      }

      const snapshot = data.data as {
        profiles?: any[];
        job_searches?: any[];
        candidate_matches?: any[];
        candidate_bookmarks?: any[];
        admin_profiles?: any[];
        external_submissions?: any[];
        admin_settings?: any[];
        two_factor_auth?: any[];
      };

      if (!snapshot) {
        throw new Error("Backup snapshot is empty or invalid.");
      }

      // Fetch current search IDs for this user so we can clean up matches safely
      const { data: existingSearches, error: searchesErr } = await supabase
        .from("job_searches")
        .select("id")
        .eq("user_id", user.id);

      if (searchesErr) {
        console.warn("Warning while loading existing searches", searchesErr.message);
      }

      const searchIds = (existingSearches || []).map(s => s.id);

      if (searchIds.length) {
        const { error: delMatchesErr } = await supabase
          .from("candidate_matches")
          .delete()
          .in("search_id", searchIds);
        if (delMatchesErr && !String(delMatchesErr.message).includes("0 rows")) {
          console.warn("Delete candidate_matches warning", delMatchesErr.message);
        }
      }

      const deleteSteps = [
        supabase.from("candidate_bookmarks").delete().eq("user_id", user.id),
        supabase.from("job_searches").delete().eq("user_id", user.id),
        supabase.from("profiles").delete().eq("user_id", user.id),
        supabase.from("admin_profiles").delete().eq("user_id", user.id),
        supabase.from("external_submissions").delete().eq("admin_user_id", user.id),
        supabase.from("admin_settings").delete().eq("user_id", user.id),
        supabase.from("two_factor_auth").delete().eq("user_id", user.id),
      ];

      for (const step of deleteSteps) {
        const { error: delError } = await step;
        if (delError && !String(delError.message).includes("0 rows")) {
          console.warn("Delete step warning", delError.message);
        }
      }

      // Insert parents then dependents if present in snapshot
      if (snapshot.admin_profiles && snapshot.admin_profiles.length) {
        const adminRows = snapshot.admin_profiles.filter(row => row.user_id === user.id);
        if (adminRows.length) {
          const { error: adminErr } = await supabase.from("admin_profiles").insert(adminRows);
          if (adminErr) throw adminErr;
        }
      }

      if (snapshot.profiles && snapshot.profiles.length) {
        const { error: profErr } = await supabase.from("profiles").insert(snapshot.profiles);
        if (profErr) throw profErr;
      }

      if (snapshot.job_searches && snapshot.job_searches.length) {
        const { error: jsErr } = await supabase
          .from("job_searches")
          .insert(snapshot.job_searches);
        if (jsErr) throw jsErr;
      }

      if (snapshot.candidate_bookmarks && snapshot.candidate_bookmarks.length) {
        const { error: cbErr } = await supabase
          .from("candidate_bookmarks")
          .insert(snapshot.candidate_bookmarks);
        if (cbErr) throw cbErr;
      }

      if (snapshot.candidate_matches && snapshot.candidate_matches.length) {
        const { error: cmErr } = await supabase
          .from("candidate_matches")
          .insert(snapshot.candidate_matches);
        if (cmErr) throw cmErr;
      }

      if (snapshot.external_submissions && snapshot.external_submissions.length) {
        const { error: esErr } = await supabase
          .from("external_submissions")
          .insert(snapshot.external_submissions);
        if (esErr) throw esErr;
      }

      if (snapshot.admin_settings && snapshot.admin_settings.length) {
        const { error: asErr } = await supabase
          .from("admin_settings")
          .insert(snapshot.admin_settings);
        if (asErr) throw asErr;
      }

      if (snapshot.two_factor_auth && snapshot.two_factor_auth.length) {
        const { error: tfaErr } = await supabase
          .from("two_factor_auth")
          .insert(snapshot.two_factor_auth);
        if (tfaErr) throw tfaErr;
      }

      toast({
        title: "Backup restored",
        description: "Your data has been restored from the selected backup.",
      });
      addLog("restore", `Restored backup${data.label ? ` "${data.label}"` : ""}.`);
    } catch (err: any) {
      console.error("Error restoring backup", err);
      toast({
        title: "Restore failed",
        description: err.message ?? "Unexpected error while restoring backup.",
        variant: "destructive",
      });
    } finally {
      setIsRestoringId(null);
    }
  };

  const restoreFromLocalFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (!file.name.endsWith('.json')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a valid JSON backup file.",
        variant: "destructive",
      });
      return;
    }

    setIsRestoringFromFile(true);

    try {
      const fileContent = await file.text();
      const snapshot = JSON.parse(fileContent) as {
        profiles?: any[];
        job_searches?: any[];
        candidate_matches?: any[];
        candidate_bookmarks?: any[];
        admin_profiles?: any[];
        external_submissions?: any[];
        admin_settings?: any[];
        two_factor_auth?: any[];
      };

      if (!snapshot || typeof snapshot !== 'object') {
        throw new Error("Invalid backup file structure.");
      }

      // Fetch current search IDs for this user so we can clean up matches safely
      const { data: existingSearches, error: searchesErr } = await supabase
        .from("job_searches")
        .select("id")
        .eq("user_id", user.id);

      if (searchesErr) {
        console.warn("Warning while loading existing searches", searchesErr.message);
      }

      const searchIds = (existingSearches || []).map(s => s.id);

      if (searchIds.length) {
        const { error: delMatchesErr } = await supabase
          .from("candidate_matches")
          .delete()
          .in("search_id", searchIds);
        if (delMatchesErr && !String(delMatchesErr.message).includes("0 rows")) {
          console.warn("Delete candidate_matches warning", delMatchesErr.message);
        }
      }

      const deleteSteps = [
        supabase.from("candidate_bookmarks").delete().eq("user_id", user.id),
        supabase.from("job_searches").delete().eq("user_id", user.id),
        supabase.from("profiles").delete().eq("user_id", user.id),
        supabase.from("admin_profiles").delete().eq("user_id", user.id),
        supabase.from("external_submissions").delete().eq("admin_user_id", user.id),
        supabase.from("admin_settings").delete().eq("user_id", user.id),
        supabase.from("two_factor_auth").delete().eq("user_id", user.id),
      ];

      for (const step of deleteSteps) {
        const { error: delError } = await step;
        if (delError && !String(delError.message).includes("0 rows")) {
          console.warn("Delete step warning", delError.message);
        }
      }

      // Insert parents then dependents if present in snapshot
      if (snapshot.admin_profiles && snapshot.admin_profiles.length) {
        const adminRows = snapshot.admin_profiles.filter(row => row.user_id === user.id);
        if (adminRows.length) {
          const { error: adminErr } = await supabase.from("admin_profiles").insert(adminRows);
          if (adminErr) throw adminErr;
        }
      }

      if (snapshot.profiles && snapshot.profiles.length) {
        const { error: profErr } = await supabase.from("profiles").insert(snapshot.profiles);
        if (profErr) throw profErr;
      }

      if (snapshot.job_searches && snapshot.job_searches.length) {
        const { error: jsErr } = await supabase
          .from("job_searches")
          .insert(snapshot.job_searches);
        if (jsErr) throw jsErr;
      }

      if (snapshot.candidate_bookmarks && snapshot.candidate_bookmarks.length) {
        const { error: cbErr } = await supabase
          .from("candidate_bookmarks")
          .insert(snapshot.candidate_bookmarks);
        if (cbErr) throw cbErr;
      }

      if (snapshot.candidate_matches && snapshot.candidate_matches.length) {
        const { error: cmErr } = await supabase
          .from("candidate_matches")
          .insert(snapshot.candidate_matches);
        if (cmErr) throw cmErr;
      }

      if (snapshot.external_submissions && snapshot.external_submissions.length) {
        const { error: esErr } = await supabase
          .from("external_submissions")
          .insert(snapshot.external_submissions);
        if (esErr) throw esErr;
      }

      if (snapshot.admin_settings && snapshot.admin_settings.length) {
        const { error: asErr } = await supabase
          .from("admin_settings")
          .insert(snapshot.admin_settings);
        if (asErr) throw asErr;
      }

      if (snapshot.two_factor_auth && snapshot.two_factor_auth.length) {
        const { error: tfaErr } = await supabase
          .from("two_factor_auth")
          .insert(snapshot.two_factor_auth);
        if (tfaErr) throw tfaErr;
      }

      toast({
        title: "Backup restored",
        description: "Your data has been restored from the uploaded file.",
      });
      addLog("restore", `Restored backup from local file: ${file.name}`);
      
      // Clear the file input
      event.target.value = '';
    } catch (err: any) {
      console.error("Error restoring from local file", err);
      toast({
        title: "Restore failed",
        description: err.message ?? "Failed to restore from the selected file.",
        variant: "destructive",
      });
      event.target.value = '';
    } finally {
      setIsRestoringFromFile(false);
    }
  };

  const deleteBackup = async (backupId: string) => {
    setIsDeletingId(backupId);
    try {
      const target = backups.find(b => b.id === backupId);
      const { error } = await supabase.from("data_backups").delete().eq("id", backupId);
      if (error) throw error;
      toast({
        title: "Backup deleted",
        description: "The selected backup has been removed.",
      });
      setBackups(prev => prev.filter(b => b.id !== backupId));
      addLog(
        "delete",
        `Deleted backup${target?.label ? ` "${target.label}"` : ""}.`,
      );
    } catch (err: any) {
      console.error("Error deleting backup", err);
      toast({
        title: "Delete failed",
        description: err.message ?? "Unexpected error while deleting backup.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleConnectDrive = async () => {
    if (!user) return;

    setIsConnectingDrive(true);

    try {
      const redirectUrl = `${window.location.origin}/developer-settings`;

      const { data, error } = await supabase.functions.invoke("google-drive-auth-url", {
        body: {
          redirect_uri: redirectUrl,
        },
      });

      if (error || !data?.authUrl) {
        throw new Error(error?.message ?? "Failed to get Google OAuth URL");
      }

      window.location.href = data.authUrl as string;
    } catch (err: any) {
      console.error("Error starting Google Drive connect flow:", err);
      toast({
        title: "Failed to start Google Drive connect",
        description: err.message ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleDriveCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      setIsConnectingDrive(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        if (!token) {
          throw new Error("Not authenticated");
        }

        const { data, error } = await supabase.functions.invoke("google-drive-oauth", {
          body: {
            code,
            redirect_uri: `${window.location.origin}/developer-settings`,
          },
        });

        if (error) throw error;

        toast({
          title: "Google Drive connected",
          description: "You can now sync backups to Google Drive.",
        });

        setIsDriveConnected(true);
        addLog("backup", "Connected Google Drive successfully");

        // Clean up URL
        window.history.replaceState({}, document.title, "/developer-settings");
      } catch (err: any) {
        console.error("Error connecting Drive:", err);
        toast({
          title: "Failed to connect Drive",
          description: err.message ?? "Unexpected error",
          variant: "destructive",
        });
      } finally {
        setIsConnectingDrive(false);
      }
    }
  };

  const syncBackupToDrive = async () => {
    if (!user || !isDriveConnected) return;
    setIsSyncingToDrive(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error("Not authenticated");
      }

      const { data, error } = await supabase.functions.invoke("google-drive-backup", {
        body: {},
      });

      if (error) throw error;

      toast({
        title: "Synced to Google Drive",
        description: "Backup uploaded to Drive successfully.",
      });

      addLog("backup", "Synced backup to Google Drive");
      setDriveFileId(data.file_id);
    } catch (err: any) {
      console.error("Error syncing to Drive:", err);
      toast({
        title: "Failed to sync to Drive",
        description: err.message ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsSyncingToDrive(false);
    }
  };

  const restoreFromDrive = async () => {
    if (!user || !isDriveConnected || !driveFileId) return;
    setIsRestoringFromDrive(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error("Not authenticated");
      }

      const { data, error } = await supabase.functions.invoke("google-drive-restore", {
        body: {},
      });

      if (error) throw error;

      toast({
        title: "Restored from Google Drive",
        description: "Data restored successfully from Drive backup.",
      });

      addLog("restore", "Restored data from Google Drive backup");
    } catch (err: any) {
      console.error("Error restoring from Drive:", err);
      toast({
        title: "Failed to restore from Drive",
        description: err.message ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsRestoringFromDrive(false);
    }
  };

  useEffect(() => {
    handleDriveCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <AppSidebarLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppSidebarLayout>
    );
  }

  if (!user) return null;

  return (
    <AppSidebarLayout>
      <div className="flex flex-col min-h-screen">
        <div className="container mx-auto px-4 py-8 max-w-5xl relative z-10 flex-1">
          <main className="space-y-6">
            <header className="space-y-2">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Developer Settings
              </h1>
              <p className="text-muted-foreground max-w-2xl">
                Create secure backups of your recruiting data, download them locally, and restore or roll back
                to any saved snapshot.
              </p>
            </header>

            <section className="space-y-6">
              <Card className="shadow-lg backdrop-blur-md bg-gradient-to-br from-card/95 to-card/80 border-primary/20 hover:border-primary/40 transition-all duration-300">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/20">
                      <Cloud className="h-5 w-5 text-blue-600" />
                    </div>
                    <span>Google Drive Backup</span>
                  </CardTitle>
                  <CardDescription>
                    Sync your backup to Google Drive for additional redundancy. Only one backup file is
                    maintained and overwrites on each sync.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!isDriveConnected ? (
                    <>
                      <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                        <p className="text-sm text-muted-foreground">
                          Connect your Google Drive to enable secure cloud backup syncing with automatic encryption.
                        </p>
                      </div>
                      <Button
                        onClick={handleConnectDrive}
                        disabled={isConnectingDrive}
                        className="w-full gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                      >
                        {isConnectingDrive ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Cloud className="h-4 w-4" />
                            Connect Google Drive
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/40 px-3 py-2">
                        <span className="text-sm font-medium">Google Drive Connected</span>
                        <span className="text-xs text-green-600 dark:text-green-400">✓ Active</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="sync-drive" className="text-sm font-medium">
                            Auto-sync to Drive
                          </Label>
                          <Switch
                            id="sync-drive"
                            checked={syncToDrive}
                            onCheckedChange={setSyncToDrive}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Automatically upload backups to Google Drive when created.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={syncBackupToDrive}
                          disabled={isSyncingToDrive}
                          variant="outline"
                          className="flex-1 gap-2"
                        >
                          {isSyncingToDrive ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <Cloud className="h-4 w-4" />
                              Sync Now
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={restoreFromDrive}
                          disabled={isRestoringFromDrive || !driveFileId}
                          variant="outline"
                          className="flex-1 gap-2"
                        >
                          {isRestoringFromDrive ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Restoring...
                            </>
                          ) : (
                            <>
                              <RotateCcw className="h-4 w-4" />
                              Restore
                            </>
                          )}
                        </Button>
                      </div>
                      {!driveFileId && (
                        <p className="text-xs text-muted-foreground">
                          No backup file found on Drive yet. Create or sync a backup first.
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* External Submissions Configuration */}
            <section className="space-y-6">
              <Card className="shadow-[var(--shadow-card)] backdrop-blur-sm bg-card/95 border-primary/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Inbox className="h-5 w-5" />
                    External Resume Submissions
                    {hasAdminSettings && isReceivingActive && (
                      <Badge className="ml-2 bg-green-500/20 text-green-600 border-green-500/30">Active</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Configure your account to receive resume submissions from your external landing page.
                    Candidates can submit their resumes directly to your portal.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="admin-email" className="text-sm font-medium">
                      Receiving Email Address
                    </Label>
                    <Input
                      id="admin-email"
                      type="email"
                      placeholder="e.g., admin@company.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      This email identifies you as the receiving admin. Use it in your landing page form.
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="receiving-active" className="text-sm font-medium">
                        Accept Submissions
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Toggle off to temporarily stop receiving new submissions.
                      </p>
                    </div>
                    <Switch
                      id="receiving-active"
                      checked={isReceivingActive}
                      onCheckedChange={setIsReceivingActive}
                    />
                  </div>

                  <Button
                    onClick={saveAdminSettings}
                    disabled={isSavingAdminSettings || !adminEmail.trim()}
                    className="w-full"
                  >
                    {isSavingAdminSettings ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Settings"
                    )}
                  </Button>

                  {hasAdminSettings && (
                    <div className="pt-4 border-t border-border/30 space-y-3">
                      <Label className="text-sm font-medium">API Endpoint for Landing Page</Label>
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value="https://olkbhjyfpdvcovtuekzt.supabase.co/functions/v1/receive-external-resume"
                          className="text-xs font-mono bg-muted/50"
                        />
                        <Button variant="outline" size="icon" onClick={copyEndpointUrl}>
                          {copiedEndpoint ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Use this endpoint in your Next.js landing page to submit resumes. 
                        Pass <code className="bg-muted px-1 rounded">admin_email={adminEmail || "your-email"}</code> in the form data.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
              <Card className="shadow-[var(--shadow-card)] backdrop-blur-sm bg-card/95 border-primary/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Create Backup
                  </CardTitle>
                  <CardDescription>
                    Snapshot your recruiting data including candidates, searches, bookmarks, external submissions, and security settings.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Optional label
                    </label>
                    <Input
                      value={label}
                      onChange={e => setLabel(e.target.value)}
                      placeholder="e.g. Before major import, Stable config, etc."
                    />
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Data to Include</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        { key: 'profiles', label: 'Candidate Profiles', desc: 'All resume data' },
                        { key: 'job_searches', label: 'Job Searches', desc: 'Search history' },
                        { key: 'candidate_matches', label: 'Matched Candidates', desc: 'AI match results' },
                        { key: 'candidate_bookmarks', label: 'Bookmarks', desc: 'Saved candidates' },
                        { key: 'admin_profiles', label: 'Admin Settings', desc: 'Your preferences' },
                        { key: 'external_submissions', label: 'External Submissions', desc: 'Landing page resumes' },
                        { key: 'admin_settings', label: 'Email Settings', desc: 'Submission config' },
                        { key: 'two_factor_auth', label: '2FA Settings', desc: 'Security config' },
                      ].map(option => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() =>
                            setSelectedTables(prev => ({
                              ...prev,
                              [option.key]: !prev[option.key],
                            }))
                          }
                          className="flex flex-col gap-1 rounded-lg border border-border/60 bg-gradient-to-br from-muted/40 to-muted/20 px-3 py-3 text-left hover:border-primary/40 hover:bg-accent/40 transition-all duration-200"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{option.label}</span>
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-md border transition-all ${selectedTables[option.key]
                                ? 'bg-primary text-primary-foreground border-primary scale-110'
                                : 'bg-background text-muted-foreground border-border'
                                }`}
                            >
                              {selectedTables[option.key] && '✓'}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">{option.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={createBackup}
                    disabled={isCreatingBackup}
                    className="w-full gap-2"
                  >
                    {isCreatingBackup ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating backup...
                      </>
                    ) : (
                      <>
                        <Database className="h-4 w-4" />
                        Create Backup Now
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Backups are stored per account. Restores will overwrite your own data in the tracked
                    tables but never affect other users.
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-[var(--shadow-card)] backdrop-blur-sm bg-card/95 border-primary/10">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Existing Backups</CardTitle>
                    <CardDescription>
                      Choose a snapshot to download, restore or remove. Ordered from newest to oldest.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 sm:mt-0 gap-2"
                    onClick={() => setIsLogDialogOpen(true)}
                  >
                    <RotateCcw className="h-4 w-4" />
                    View Activity Log
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Upload Local Backup</label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Restore data from a previously downloaded backup file.
                    </p>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".json"
                        onChange={restoreFromLocalFile}
                        disabled={isRestoringFromFile}
                        className="hidden"
                        id="backup-file-upload"
                      />
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        disabled={isRestoringFromFile}
                        onClick={() => document.getElementById('backup-file-upload')?.click()}
                      >
                        {isRestoringFromFile ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Restoring...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            Upload & Restore Backup
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {isLoadingBackups ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading backups...
                    </div>
                  ) : backups.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                      No backups yet. Create your first snapshot using the panel on the left.
                    </p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40%]">Label / ID</TableHead>
                            <TableHead>Created At</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {backups.map(backup => (
                            <TableRow key={backup.id}>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium truncate max-w-[220px]">
                                    {backup.label || 'Untitled backup'}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground break-all">
                                    {backup.id}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {new Date(backup.created_at).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right space-x-1">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Download backup JSON"
                                  onClick={() => void downloadBackup(backup.id)}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Restore from this backup"
                                  onClick={() => void restoreBackup(backup.id)}
                                  disabled={isRestoringId === backup.id}
                                >
                                  {isRestoringId === backup.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  title="Delete this backup"
                                  onClick={() => void deleteBackup(backup.id)}
                                  disabled={isDeletingId === backup.id}
                                >
                                  {isDeletingId === backup.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          </main>
        </div>

        <Dialog open={isLogDialogOpen} onOpenChange={setIsLogDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Backup &amp; Restore Activity</DialogTitle>
              <DialogDescription>
                Session-only log of recent backup, restore, download and delete actions.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 max-h-80 space-y-3 overflow-y-auto">
              {activityLog.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No activity yet. Create, restore or delete a backup to see it logged here.
                </p>
              ) : (
                activityLog.map(entry => (
                  <div
                    key={entry.id}
                    className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize">{entry.action}</span>
                      <span className="text-xs text-muted-foreground">{entry.timestamp}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.details}</p>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Footer />
      </div>
    </AppSidebarLayout>
  );
};

export default DeveloperSettings;
