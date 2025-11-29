import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { FileText, Mail, Phone, MapPin, Briefcase, ExternalLink, Trash2, Download, FileSpreadsheet } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import Footer from '@/components/Footer';
import * as XLSX from 'xlsx';
import { UploadDateFilter, type UploadDateFilterValue } from '@/components/UploadDateFilter';
import AppSidebarLayout from '@/components/AppSidebarLayout';

type Profile = Tables<'profiles'>;

export default function Candidates() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJobTitle, setSelectedJobTitle] = useState<string>('all');
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [duplicateIds, setDuplicateIds] = useState<string[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [deletingDuplicates, setDeletingDuplicates] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [experienceFilter, setExperienceFilter] = useState<string>('all');
  const [locations, setLocations] = useState<string[]>([]);
  const [uploadDateFilter, setUploadDateFilter] = useState<UploadDateFilterValue>('all');
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    fetchProfiles();
  }, [currentPage, searchTerm, selectedJobTitle, locationFilter, experienceFilter, uploadDateFilter]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedCandidates(new Set());
  }, [searchTerm, selectedJobTitle, locationFilter, experienceFilter, uploadDateFilter]);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      // Build the query
      let query = supabase
        .from('profiles')
        .select('id, full_name, email, phone_number, location, job_title, years_of_experience, sector, skills, education, resume_file_url, avatar_url, created_at, user_id', { count: 'exact' });

      // Apply filters
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        query = query.or(`full_name.ilike.%${searchLower}%,email.ilike.%${searchLower}%,phone_number.ilike.%${searchLower}%,job_title.ilike.%${searchLower}%,location.ilike.%${searchLower}%,sector.ilike.%${searchLower}%`);
      }

      if (selectedJobTitle !== 'all') {
        query = query.eq('job_title', selectedJobTitle);
      }

      if (locationFilter !== 'all') {
        query = query.eq('location', locationFilter);
      }

      if (experienceFilter !== 'all') {
        if (experienceFilter === '0-2') {
          query = query.lte('years_of_experience', 2);
        } else if (experienceFilter === '3-5') {
          query = query.gte('years_of_experience', 3).lte('years_of_experience', 5);
        } else if (experienceFilter === '6-10') {
          query = query.gte('years_of_experience', 6).lte('years_of_experience', 10);
        } else if (experienceFilter === '10+') {
          query = query.gt('years_of_experience', 10);
        }
      }

      if (uploadDateFilter !== 'all') {
        const now = new Date();
        const from = new Date(now);

        if (uploadDateFilter === '24h') {
          from.setDate(now.getDate() - 1);
        } else if (uploadDateFilter === '3d') {
          from.setDate(now.getDate() - 3);
        } else if (uploadDateFilter === '7d') {
          from.setDate(now.getDate() - 7);
        } else if (uploadDateFilter === '30d') {
          from.setDate(now.getDate() - 30);
        }

        query = query.gte('created_at', from.toISOString());
      }

      // Apply pagination and ordering
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      
      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      setProfiles((data || []) as Profile[]);
      setTotalCount(count || 0);
      
      // Fetch unique values for filters only once
      if (jobTitles.length === 0) {
        const { data: titlesData } = await supabase
          .from('profiles')
          .select('job_title')
          .not('job_title', 'is', null);
        
        const uniqueTitles = Array.from(
          new Set(titlesData?.map(p => p.job_title).filter(Boolean) as string[])
        );
        setJobTitles(uniqueTitles);
      }
      
      if (locations.length === 0) {
        const { data: locationsData } = await supabase
          .from('profiles')
          .select('location')
          .not('location', 'is', null);
        
        const uniqueLocations = Array.from(
          new Set(locationsData?.map(p => p.location).filter(Boolean) as string[])
        );
        setLocations(uniqueLocations);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch candidates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };


  const handleViewResume = (resumeUrl: string | null) => {
    if (!resumeUrl) {
      toast({
        title: 'No Resume',
        description: 'This candidate does not have a resume file uploaded',
        variant: 'destructive',
      });
      return;
    }
    window.open(resumeUrl, '_blank');
  };

  const findDuplicates = async () => {
    setCheckingDuplicates(true);
    
    try {
      // Fetch ALL profiles from database (only needed fields for efficiency)
      const { data: allProfiles, error } = await supabase
        .from('profiles')
        .select('id, email, phone_number, created_at');
      
      if (error) throw error;
      
      if (!allProfiles || allProfiles.length === 0) {
        toast({
          title: 'No Profiles Found',
          description: 'No candidate profiles to check for duplicates',
        });
        setCheckingDuplicates(false);
        return;
      }
      
      // Find duplicates based on email or phone number
      const duplicateMap = new Map<string, typeof allProfiles>();
      
      allProfiles.forEach(profile => {
        // Create a key based on email or phone (whichever exists)
        const key = profile.email || profile.phone_number;
        if (key) {
          if (!duplicateMap.has(key)) {
            duplicateMap.set(key, []);
          }
          duplicateMap.get(key)!.push(profile);
        }
      });

      // Filter out entries with only one profile (not duplicates)
      const duplicates: string[] = [];
      duplicateMap.forEach((profileList, key) => {
        if (profileList.length > 1) {
          // Sort by created_at, keep the newest one, mark others for deletion
          const sortedProfiles = profileList.sort((a, b) => 
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          );
          // Add all except the first (newest) to the deletion list
          sortedProfiles.slice(1).forEach(p => duplicates.push(p.id));
        }
      });

      setDuplicateIds(duplicates);
      setDuplicateCount(duplicates.length);

      if (duplicates.length === 0) {
        toast({
          title: 'No Duplicates Found',
          description: `Checked ${allProfiles.length} profiles - all are unique`,
        });
      } else {
        toast({
          title: 'Duplicates Detected',
          description: `Found ${duplicates.length} duplicate profiles across ${allProfiles.length} total profiles`,
        });
        setShowDeleteDialog(true);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to check for duplicates',
        variant: 'destructive',
      });
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const handleDeleteDuplicates = async () => {
    setDeletingDuplicates(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .in('id', duplicateIds);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Deleted ${duplicateCount} duplicate profile(s)`,
      });

      await fetchProfiles();
      setShowDeleteDialog(false);
      setDuplicateIds([]);
      setDuplicateCount(0);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete duplicates',
        variant: 'destructive',
      });
    } finally {
      setDeletingDuplicates(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const currentPageIds = profiles.map(p => p.id);
      setSelectedCandidates(new Set(currentPageIds));
    } else {
      setSelectedCandidates(new Set());
    }
  };

  const handleSelectCandidate = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedCandidates);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedCandidates(newSelected);
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .in('id', Array.from(selectedCandidates));

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Deleted ${selectedCandidates.size} candidate(s)`,
      });

      await fetchProfiles();
      setShowBulkDeleteDialog(false);
      setSelectedCandidates(new Set());
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete candidates',
        variant: 'destructive',
      });
    } finally {
      setBulkDeleting(false);
    }
  };


  const exportToExcel = async () => {
    // Fetch all profiles for export
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone_number, location, job_title, years_of_experience, sector, skills, education, resume_file_url');
    
    const excelData = (allProfiles || []).map(profile => ({
      'Name': profile.full_name || '',
      'Email': profile.email || '',
      'Phone': profile.phone_number || '',
      'Location': profile.location || '',
      'Job Title': profile.job_title || '',
      'Experience (Years)': profile.years_of_experience || 0,
      'Sector': profile.sector || '',
      'Skills': profile.skills?.join(', ') || '',
      'Education': profile.education || '',
      'Resume URL': profile.resume_file_url || '',
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    
    // Auto-size columns
    const maxWidth = 50;
    const colWidths = Object.keys(excelData[0] || {}).map(key => ({
      wch: Math.min(maxWidth, Math.max(key.length, ...excelData.map(row => String(row[key as keyof typeof row]).length)))
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `candidates_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: 'Export Successful',
      description: `Exported ${excelData.length} candidates to Excel`,
    });
  };

  return (
    <AppSidebarLayout>
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-primary/5 flex flex-col">
        <div className="container mx-auto px-4 py-8 flex-1">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground">All Candidates</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCandidates.size > 0 && (
              <Button
                variant="destructive"
                onClick={() => setShowBulkDeleteDialog(true)}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selectedCandidates.size})
              </Button>
            )}
            <Button
              variant="outline"
              onClick={exportToExcel}
              disabled={totalCount === 0}
              className="gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </Button>
            <Button
              variant="destructive"
              onClick={findDuplicates}
              disabled={checkingDuplicates || totalCount === 0}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {checkingDuplicates ? 'Checking...' : 'Delete Duplicates'}
            </Button>
          </div>
        </div>

        {/* Advanced Filters */}
        <Card className="p-6 mb-8 bg-card/50 backdrop-blur-sm">
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="search" className="text-sm font-medium mb-2 block">
                  Search Candidates
                </Label>
                <Input
                  id="search"
                  placeholder="Search by name, email, phone, job title, location, sector, or skills..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="job-title" className="text-sm font-medium mb-2 block">
                  Job Title
                </Label>
                <Select value={selectedJobTitle} onValueChange={setSelectedJobTitle}>
                  <SelectTrigger id="job-title">
                    <SelectValue placeholder="All Job Titles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Job Titles</SelectItem>
                    {jobTitles.map((title) => (
                      <SelectItem key={title} value={title}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="location" className="text-sm font-medium mb-2 block">
                  Location
                </Label>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger id="location">
                    <SelectValue placeholder="All Locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations.map((location) => (
                      <SelectItem key={location} value={location}>
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="experience" className="text-sm font-medium mb-2 block">
                  Years of Experience
                </Label>
                <Select value={experienceFilter} onValueChange={setExperienceFilter}>
                  <SelectTrigger id="experience">
                    <SelectValue placeholder="All Experience Levels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Experience Levels</SelectItem>
                    <SelectItem value="0-2">0-2 years</SelectItem>
                    <SelectItem value="3-5">3-5 years</SelectItem>
                    <SelectItem value="6-10">6-10 years</SelectItem>
                    <SelectItem value="10+">10+ years</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <UploadDateFilter value={uploadDateFilter} onChange={setUploadDateFilter} />
            </div>

            {(searchTerm || selectedJobTitle !== 'all' || locationFilter !== 'all' || experienceFilter !== 'all' || uploadDateFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedJobTitle('all');
                  setLocationFilter('all');
                  setExperienceFilter('all');
                  setUploadDateFilter('all');
                }}
                className="text-sm"
              >
                Clear All Filters
              </Button>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} candidate(s) matching current filters
            </span>
            {selectedCandidates.size > 0 && (
              <span className="font-medium text-primary">
                {selectedCandidates.size} selected
              </span>
            )}
          </div>
        </Card>

        {/* Candidates List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading candidates...</p>
          </div>
        ) : profiles.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No Candidates Found</h3>
            <p className="text-muted-foreground">
              {profiles.length === 0
                ? 'Upload some resumes to get started'
                : 'Try adjusting your filters'}
            </p>
          </Card>
        ) : (
          <>
            {/* Bulk Select Header */}
            {profiles.length > 0 && (
              <Card className="p-4 mb-4 bg-muted/50">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={
                      selectedCandidates.size > 0 &&
                      profiles.every(p => selectedCandidates.has(p.id))
                    }
                    onCheckedChange={handleSelectAll}
                  />
                  <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                    Select all on this page
                  </Label>
                </div>
              </Card>
            )}
            
            <div className="grid gap-4">
              {profiles.map((profile) => (
              <Card
                key={profile.id}
                className="p-6 hover:shadow-lg transition-all duration-300 bg-card/50 backdrop-blur-sm border-2 hover:border-primary/50"
              >
                <div className="flex gap-4">
                  <div className="flex items-start pt-1">
                    <Checkbox
                      checked={selectedCandidates.has(profile.id)}
                      onCheckedChange={(checked) => handleSelectCandidate(profile.id, checked as boolean)}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-foreground">
                              {profile.full_name || 'Unknown'}
                            </h3>
                            {profile.job_title && (
                              <div className="flex items-center gap-2 mt-1">
                                <Briefcase className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                              {profile.job_title}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-2 text-sm">
                      {profile.email && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-4 w-4" />
                          <span>{profile.email}</span>
                        </div>
                      )}
                      {profile.phone_number && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          <span>{profile.phone_number}</span>
                        </div>
                      )}
                      {profile.location && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <span>{profile.location}</span>
                        </div>
                      )}
                      {profile.years_of_experience && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Briefcase className="h-4 w-4" />
                          <span>{profile.years_of_experience} years experience</span>
                        </div>
                      )}
                    </div>

                    {profile.skills && profile.skills.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {profile.skills.slice(0, 5).map((skill, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium"
                          >
                            {skill}
                          </span>
                        ))}
                        {profile.skills.length > 5 && (
                          <span className="px-3 py-1 bg-muted text-muted-foreground rounded-full text-xs font-medium">
                            +{profile.skills.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex md:flex-col gap-2">
                    <Button
                      onClick={() => handleViewResume(profile.resume_file_url)}
                      className="gap-2 whitespace-nowrap"
                      disabled={!profile.resume_file_url}
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Resume
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
            ))}
            </div>
            
            {/* Pagination */}
            {totalCount > ITEMS_PER_PAGE && (() => {
              const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
              const getPageNumbers = () => {
                const pages = [];
                const showMax = 7; // Maximum pages to show
                
                if (totalPages <= showMax) {
                  // Show all pages if total is less than max
                  for (let i = 1; i <= totalPages; i++) {
                    pages.push(i);
                  }
                } else {
                  // Always show first page
                  pages.push(1);
                  
                  if (currentPage > 3) {
                    pages.push('ellipsis-start');
                  }
                  
                  // Show pages around current
                  const start = Math.max(2, currentPage - 1);
                  const end = Math.min(totalPages - 1, currentPage + 1);
                  
                  for (let i = start; i <= end; i++) {
                    pages.push(i);
                  }
                  
                  if (currentPage < totalPages - 2) {
                    pages.push('ellipsis-end');
                  }
                  
                  // Always show last page
                  pages.push(totalPages);
                }
                
                return pages;
              };
              
              return (
                <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    size="sm"
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1 flex-wrap">
                    {getPageNumbers().map((page, idx) => {
                      if (typeof page === 'string') {
                        return (
                          <span key={page} className="px-2 text-muted-foreground">
                            ...
                          </span>
                        );
                      }
                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          onClick={() => setCurrentPage(page)}
                          size="sm"
                          className="min-w-[40px]"
                        >
                          {page}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    size="sm"
                  >
                    Next
                  </Button>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Candidates?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCandidates.size} candidate profile(s) will be permanently deleted. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? 'Deleting...' : `Delete ${selectedCandidates.size} Profile(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Duplicates Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Duplicate Candidates?</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateCount} duplicate candidate profile(s) will be permanently deleted. 
              This action cannot be undone.
              <br /><br />
              <strong>Note:</strong> For candidates with the same email or phone number, 
              only the most recently uploaded profile will be kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDuplicates}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDuplicates}
              disabled={deletingDuplicates}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingDuplicates ? 'Deleting...' : `Delete ${duplicateCount} Profile(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Footer />
    </div>
  </AppSidebarLayout>
  );
}
