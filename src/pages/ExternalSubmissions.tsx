import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import AppSidebarLayout from "@/components/AppSidebarLayout";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Loader2, 
  FileText, 
  Mail, 
  Phone, 
  Briefcase, 
  Check, 
  X, 
  Trash2, 
  Eye,
  Search,
  Filter,
  RefreshCw,
  User,
  Calendar,
  MapPin,
  Sparkles,
  CheckCircle2
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ExternalSubmission {
  id: string;
  candidate_name: string;
  candidate_email: string | null;
  candidate_phone: string | null;
  interested_job: string;
  resume_file_url: string;
  admin_user_id: string;
  status: "pending" | "accepted" | "rejected";
  parsed_data: {
    full_name?: string;
    email?: string;
    phone?: string;
    location?: string;
    skills?: string[];
    experience_years?: number;
    education?: string;
    job_title?: string;
    summary?: string;
  } | null;
  notes: string | null;
  created_at: string;
}

const ExternalSubmissions = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [submissions, setSubmissions] = useState<ExternalSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<ExternalSubmission | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processingQueue, setProcessingQueue] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      loadSubmissions();
    }
  }, [user]);

  const loadSubmissions = async () => {
    if (!user) return;
    setIsLoading(true);

    const { data, error } = await supabase
      .from("external_submissions")
      .select("*")
      .eq("admin_user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading submissions:", error);
      toast({
        title: "Failed to load submissions",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setSubmissions(data as ExternalSubmission[]);
    }
    setIsLoading(false);
  };

  const processSubmission = async (submissionId: string, apiKeyIndex: number = 1) => {
    const toastId = `processing-${submissionId}`;
    let progress = 0;

    // Show initial toast with progress
    sonnerToast.loading(
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-medium">Processing resume...</span>
        </div>
        <Progress value={progress} className="h-1" />
      </div>,
      { id: toastId, duration: Infinity }
    );

    setProcessingQueue(prev => new Map(prev).set(submissionId, progress));

    try {
      // Update progress: downloading
      progress = 30;
      sonnerToast.loading(
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium">Parsing resume with AI...</span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>,
        { id: toastId, duration: Infinity }
      );
      setProcessingQueue(prev => new Map(prev).set(submissionId, progress));

      // Call the edge function with API key index
      const { data, error } = await supabase.functions.invoke(
        'process-external-submission',
        {
          body: { submissionId, apiKeyIndex }
        }
      );

      if (error) throw error;

      // Update progress: parsing complete
      progress = 70;
      sonnerToast.loading(
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium">Generating embeddings...</span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>,
        { id: toastId, duration: Infinity }
      );
      setProcessingQueue(prev => new Map(prev).set(submissionId, progress));

      // Small delay to show final progress
      await new Promise(resolve => setTimeout(resolve, 500));

      // Success
      progress = 100;
      setProcessingQueue(prev => new Map(prev).set(submissionId, progress));
      
      sonnerToast.success(
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="font-medium">Resume processed successfully!</span>
        </div>,
        { id: toastId, duration: 3000 }
      );

      // Reload submissions after a short delay
      setTimeout(() => {
        loadSubmissions();
        setProcessingQueue(prev => {
          const newMap = new Map(prev);
          newMap.delete(submissionId);
          return newMap;
        });
      }, 1000);

    } catch (error: any) {
      console.error("Error processing submission:", error);
      sonnerToast.error(
        <div>
          <div className="font-medium">Failed to process resume</div>
          <div className="text-sm text-muted-foreground">{error.message || "Unknown error"}</div>
        </div>,
        { id: toastId, duration: 5000 }
      );
      setProcessingQueue(prev => {
        const newMap = new Map(prev);
        newMap.delete(submissionId);
        return newMap;
      });
    }
  };

  const handleAccept = async (submission: ExternalSubmission) => {
    if (!user) return;

    // Update notes if provided
    if (notes) {
      const { error: notesError } = await supabase
        .from("external_submissions")
        .update({ notes })
        .eq("id", submission.id);

      if (notesError) console.error("Failed to update notes:", notesError);
    }

    // Close dialog immediately
    setIsDetailOpen(false);

    // Start async processing
    processSubmission(submission.id);
  };

  const handleBulkAccept = async () => {
    if (!user || selectedIds.size === 0) return;

    const idsToProcess = Array.from(selectedIds);
    setSelectedIds(new Set());

    // Process in parallel batches of 3
    const BATCH_SIZE = 3;
    for (let i = 0; i < idsToProcess.length; i += BATCH_SIZE) {
      const batch = idsToProcess.slice(i, i + BATCH_SIZE);
      const apiKeyIndex = Math.floor(i / BATCH_SIZE) + 1;
      
      // Process batch in parallel
      await Promise.all(
        batch.map(id => processSubmission(id, apiKeyIndex))
      );
    }
  };

  const handleBulkReject = async () => {
    if (!user || selectedIds.size === 0) return;

    const idsToReject = Array.from(selectedIds);
    setSelectedIds(new Set());

    try {
      // Update all selected submissions to rejected status
      const { error } = await supabase
        .from("external_submissions")
        .update({ status: "rejected" })
        .in("id", idsToReject);

      if (error) throw error;

      toast({
        title: "Bulk Rejection Complete",
        description: `${idsToReject.length} submission${idsToReject.length > 1 ? 's' : ''} rejected successfully.`,
      });

      loadSubmissions();
    } catch (error: any) {
      console.error("Error rejecting submissions:", error);
      toast({
        title: "Failed to reject",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    const pendingSubmissions = filteredSubmissions.filter(s => s.status === 'pending');
    if (selectedIds.size === pendingSubmissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingSubmissions.map(s => s.id)));
    }
  };

  const handleReject = async (submission: ExternalSubmission) => {
    setIsProcessing(submission.id);

    try {
      const { error } = await supabase
        .from("external_submissions")
        .update({ status: "rejected", notes })
        .eq("id", submission.id);

      if (error) throw error;

      toast({
        title: "Candidate Rejected",
        description: "The submission has been marked as rejected.",
      });

      setIsDetailOpen(false);
      loadSubmissions();
    } catch (error: any) {
      console.error("Error rejecting submission:", error);
      toast({
        title: "Failed to reject",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDelete = async (id: string) => {
    setIsProcessing(id);

    try {
      const { error } = await supabase
        .from("external_submissions")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Submission Deleted",
        description: "The submission has been removed.",
      });

      setIsDetailOpen(false);
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } catch (error: any) {
      console.error("Error deleting submission:", error);
      toast({
        title: "Failed to delete",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(null);
    }
  };

  const openDetail = (submission: ExternalSubmission) => {
    setSelectedSubmission(submission);
    setNotes(submission.notes || "");
    setIsDetailOpen(true);
  };

  const filteredSubmissions = submissions.filter((s) => {
    const matchesSearch =
      s.candidate_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.interested_job.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.candidate_email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = submissions.filter((s) => s.status === "pending").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Pending</Badge>;
      case "accepted":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Accepted</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <AppSidebarLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppSidebarLayout>
    );
  }

  return (
    <AppSidebarLayout>
      <div className="container max-w-6xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">External Submissions</h1>
              <p className="text-muted-foreground text-sm">
                Review resumes received from your landing page
              </p>
            </div>
          </div>
          {pendingCount > 0 && (
            <Badge className="mt-2 bg-primary/20 text-primary hover:bg-primary/30">
              {pendingCount} pending review
            </Badge>
          )}
        </div>

        {/* Filters & Bulk Actions */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, or job..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={loadSubmissions} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              {statusFilter === 'pending' && filteredSubmissions.length > 0 && (
                <div className="flex items-center gap-3 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all"
                      checked={selectedIds.size === filteredSubmissions.length && filteredSubmissions.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                    <label 
                      htmlFor="select-all"
                      className="text-sm font-medium cursor-pointer select-none"
                    >
                      {selectedIds.size > 0 
                        ? `${selectedIds.size} of ${filteredSubmissions.length} selected` 
                        : `Select all ${filteredSubmissions.length} submissions`}
                    </label>
                  </div>
                  {selectedIds.size > 0 && (
                    <div className="flex gap-2 ml-auto">
                      <Button onClick={handleBulkReject} size="sm" variant="outline">
                        <X className="h-4 w-4 mr-2" />
                        Reject {selectedIds.size}
                      </Button>
                      <Button onClick={handleBulkAccept} size="sm">
                        <Check className="h-4 w-4 mr-2" />
                        Accept & Process {selectedIds.size}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Submissions Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No submissions yet</h3>
              <p className="text-muted-foreground text-sm">
                {submissions.length === 0
                  ? "Configure your admin email in Dev Options to start receiving external submissions."
                  : "No submissions match your current filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSubmissions.map((submission) => (
              <Card
                key={submission.id}
                className={`cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] group ${
                  selectedIds.has(submission.id) ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => openDetail(submission)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {submission.status === 'pending' && (
                        <Checkbox
                          checked={selectedIds.has(submission.id)}
                          onCheckedChange={() => toggleSelection(submission.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        />
                      )}
                      <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{submission.candidate_name}</CardTitle>
                        <CardDescription className="text-xs">
                          {submission.interested_job}
                        </CardDescription>
                      </div>
                    </div>
                    {getStatusBadge(submission.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {submission.candidate_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{submission.candidate_email}</span>
                      </div>
                    )}
                    {submission.candidate_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3" />
                        <span>{submission.candidate_phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(submission.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {submission.parsed_data?.skills && submission.parsed_data.skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {submission.parsed_data.skills.slice(0, 3).map((skill, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {submission.parsed_data.skills.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{submission.parsed_data.skills.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedSubmission && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    {selectedSubmission.candidate_name}
                  </DialogTitle>
                  <DialogDescription>
                    Interested in: {selectedSubmission.interested_job}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                  {/* Contact Info */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {selectedSubmission.candidate_email && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{selectedSubmission.candidate_email}</span>
                      </div>
                    )}
                    {selectedSubmission.candidate_phone && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{selectedSubmission.candidate_phone}</span>
                      </div>
                    )}
                    {selectedSubmission.parsed_data?.location && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{selectedSubmission.parsed_data.location}</span>
                      </div>
                    )}
                    {selectedSubmission.parsed_data?.experience_years && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{selectedSubmission.parsed_data.experience_years} years exp.</span>
                      </div>
                    )}
                  </div>

                  {/* Parsed Summary */}
                  {selectedSubmission.parsed_data?.summary && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Summary</h4>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                        {selectedSubmission.parsed_data.summary}
                      </p>
                    </div>
                  )}

                  {/* Skills */}
                  {selectedSubmission.parsed_data?.skills && selectedSubmission.parsed_data.skills.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedSubmission.parsed_data.skills.map((skill, i) => (
                          <Badge key={i} variant="secondary">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Resume Link */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Resume</h4>
                    <Button
                      variant="outline"
                      onClick={() => window.open(selectedSubmission.resume_file_url, "_blank")}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Resume
                    </Button>
                  </div>

                  {/* Notes */}
                  {selectedSubmission.status === "pending" && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Notes (optional)</h4>
                      <Textarea
                        placeholder="Add notes about this candidate..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                      />
                    </div>
                  )}

                  {selectedSubmission.notes && selectedSubmission.status !== "pending" && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Notes</h4>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                        {selectedSubmission.notes}
                      </p>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                  {selectedSubmission.status === "pending" ? (
                    <>
                      <Button
                        variant="destructive"
                        onClick={() => handleReject(selectedSubmission)}
                        disabled={isProcessing === selectedSubmission.id}
                      >
                        {isProcessing === selectedSubmission.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <X className="h-4 w-4 mr-2" />
                        )}
                        Reject
                      </Button>
                      <Button
                        onClick={() => handleAccept(selectedSubmission)}
                        disabled={isProcessing === selectedSubmission.id}
                      >
                        {isProcessing === selectedSubmission.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-2" />
                        )}
                        Accept & Add to Profiles
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={() => handleDelete(selectedSubmission.id)}
                      disabled={isProcessing === selectedSubmission.id}
                    >
                      {isProcessing === selectedSubmission.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Delete
                    </Button>
                  )}
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppSidebarLayout>
  );
};

export default ExternalSubmissions;
