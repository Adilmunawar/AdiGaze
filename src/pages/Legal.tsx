import { AppSidebarLayout } from '@/components/AppSidebarLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Legal = () => {
  return (
    <AppSidebarLayout>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-foreground">Legal Information</CardTitle>
            <p className="text-sm text-muted-foreground">Last updated: November 30, 2024</p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="privacy" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="privacy">Privacy Policy</TabsTrigger>
                <TabsTrigger value="terms">Terms of Service</TabsTrigger>
              </TabsList>

              <TabsContent value="privacy" className="space-y-6">
                <section>
                  <h2 className="text-xl font-semibold text-foreground">1. Introduction</h2>
                  <p className="text-muted-foreground mt-2">
                    Welcome to AdiGaze Resume Parser ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">2. Information We Collect</h2>
                  <h3 className="text-lg font-medium text-foreground mt-4">2.1 Personal Information</h3>
                  <p className="text-muted-foreground">We may collect personal information that you voluntarily provide when using our services, including:</p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li>Name and contact information (email address, phone number)</li>
                    <li>Account credentials (email and password for authentication)</li>
                    <li>Resume and CV data uploaded to our platform</li>
                    <li>Professional information (job titles, skills, experience, education)</li>
                  </ul>

                  <h3 className="text-lg font-medium text-foreground mt-4">2.2 Google Account Information</h3>
                  <p className="text-muted-foreground">When you connect your Google account for backup purposes, we access:</p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li>Your Google account email address</li>
                    <li>Permission to create and manage files in your Google Drive (only for backup/restore functionality)</li>
                  </ul>
                  <p className="text-muted-foreground mt-2">
                    <strong>Note:</strong> We only store backup files in your personal Google Drive. We do not access, read, or store any other files from your Google Drive.
                  </p>

                  <h3 className="text-lg font-medium text-foreground mt-4">2.3 Automatically Collected Information</h3>
                  <p className="text-muted-foreground">We may automatically collect certain information when you use our application:</p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li>Device information (browser type, operating system)</li>
                    <li>Usage data (features accessed, time spent on pages)</li>
                    <li>Log data (IP address, access times, error logs)</li>
                  </ul>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">3. How We Use Your Information</h2>
                  <p className="text-muted-foreground">We use the information we collect for the following purposes:</p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li>To provide and maintain our resume parsing services</li>
                    <li>To process and analyze uploaded resumes</li>
                    <li>To match candidates with job requirements</li>
                    <li>To enable backup and restore functionality via Google Drive</li>
                    <li>To authenticate and manage user accounts</li>
                    <li>To improve our services and user experience</li>
                    <li>To communicate with you about updates or changes</li>
                    <li>To ensure security and prevent fraud</li>
                  </ul>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">4. Data Storage and Security</h2>
                  <p className="text-muted-foreground">
                    We implement appropriate technical and organizational security measures to protect your personal information. Your data is stored securely using Supabase infrastructure with encryption at rest and in transit.
                  </p>
                  <p className="text-muted-foreground mt-2">
                    Google Drive integration uses OAuth 2.0 authentication, and we only store refresh tokens necessary for backup operations. We never store your Google password.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">5. Data Sharing and Disclosure</h2>
                  <p className="text-muted-foreground">We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:</p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li>With your explicit consent</li>
                    <li>To comply with legal obligations or court orders</li>
                    <li>To protect our rights, privacy, safety, or property</li>
                    <li>With service providers who assist in operating our application (under strict confidentiality agreements)</li>
                  </ul>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">6. Your Rights and Choices</h2>
                  <p className="text-muted-foreground">You have the following rights regarding your personal information:</p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li><strong>Access:</strong> Request a copy of your personal data</li>
                    <li><strong>Correction:</strong> Request correction of inaccurate data</li>
                    <li><strong>Deletion:</strong> Request deletion of your personal data</li>
                    <li><strong>Portability:</strong> Request transfer of your data</li>
                    <li><strong>Revocation:</strong> Disconnect Google Drive integration at any time</li>
                  </ul>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">7. Google API Services User Data Policy</h2>
                  <p className="text-muted-foreground">
                    Our use and transfer of information received from Google APIs adheres to the{' '}
                    <a 
                      href="https://developers.google.com/terms/api-services-user-data-policy" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Google API Services User Data Policy
                    </a>
                    , including the Limited Use requirements.
                  </p>
                  <p className="text-muted-foreground mt-2">
                    We limit our use of Google user data to providing and improving user-facing features. We do not use Google user data for advertising purposes.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">8. Data Retention</h2>
                  <p className="text-muted-foreground">
                    We retain your personal information for as long as your account is active or as needed to provide you services. You may request deletion of your data at any time by contacting us.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">9. Children's Privacy</h2>
                  <p className="text-muted-foreground">
                    Our services are not intended for individuals under the age of 16. We do not knowingly collect personal information from children.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">10. Changes to This Policy</h2>
                  <p className="text-muted-foreground">
                    We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">11. Contact Us</h2>
                  <p className="text-muted-foreground">
                    If you have any questions about this Privacy Policy or our data practices, please contact us:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li>Developer: Adil Munawar</li>
                    <li>Email: adilmunawarx@gmail.com</li>
                    <li>WhatsApp: +92 324 4965220</li>
                  </ul>
                </section>
              </TabsContent>

              <TabsContent value="terms" className="space-y-6">
                <section>
                  <h2 className="text-xl font-semibold text-foreground">1. Acceptance of Terms</h2>
                  <p className="text-muted-foreground mt-2">
                    By accessing or using AdiGaze Resume Parser ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use our Service.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">2. Description of Service</h2>
                  <p className="text-muted-foreground">
                    AdiGaze Resume Parser is a web application that provides resume parsing, candidate management, and job matching services. The Service includes:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li>Resume upload and parsing functionality</li>
                    <li>Candidate profile management</li>
                    <li>Job description matching and candidate hunting</li>
                    <li>Bookmark and search history features</li>
                    <li>Google Drive backup and restore integration</li>
                    <li>Data export capabilities</li>
                  </ul>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">3. User Accounts</h2>
                  <h3 className="text-lg font-medium text-foreground mt-4">3.1 Account Creation</h3>
                  <p className="text-muted-foreground">
                    To use certain features of the Service, you must create an account. You agree to provide accurate, current, and complete information during registration and to update such information as necessary.
                  </p>

                  <h3 className="text-lg font-medium text-foreground mt-4">3.2 Account Security</h3>
                  <p className="text-muted-foreground">
                    You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
                  </p>

                  <h3 className="text-lg font-medium text-foreground mt-4">3.3 Account Termination</h3>
                  <p className="text-muted-foreground">
                    We reserve the right to suspend or terminate your account at any time for violation of these Terms or for any other reason at our discretion.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">4. User Responsibilities</h2>
                  <p className="text-muted-foreground">When using our Service, you agree to:</p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li>Use the Service only for lawful purposes</li>
                    <li>Not upload malicious content, viruses, or harmful code</li>
                    <li>Not attempt to gain unauthorized access to any part of the Service</li>
                    <li>Not interfere with or disrupt the Service's operation</li>
                    <li>Not use the Service to harass, abuse, or harm others</li>
                    <li>Not upload content that infringes on intellectual property rights</li>
                    <li>Comply with all applicable laws and regulations</li>
                  </ul>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">5. Data and Content</h2>
                  <h3 className="text-lg font-medium text-foreground mt-4">5.1 Your Content</h3>
                  <p className="text-muted-foreground">
                    You retain ownership of all content you upload to the Service, including resumes and candidate information. By uploading content, you grant us a limited license to process, store, and display such content solely for the purpose of providing the Service.
                  </p>

                  <h3 className="text-lg font-medium text-foreground mt-4">5.2 Data Accuracy</h3>
                  <p className="text-muted-foreground">
                    You are responsible for ensuring the accuracy of the data you upload. We are not liable for any errors or inaccuracies in the parsed data resulting from unclear or improperly formatted source documents.
                  </p>

                  <h3 className="text-lg font-medium text-foreground mt-4">5.3 Data Protection</h3>
                  <p className="text-muted-foreground">
                    You must ensure that you have the necessary rights and permissions to upload personal information of third parties (candidates). You are responsible for complying with applicable data protection laws.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">6. Google Drive Integration</h2>
                  <p className="text-muted-foreground">
                    If you choose to connect your Google account for backup functionality:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li>You authorize us to create and manage backup files in your Google Drive</li>
                    <li>We will only access the specific files created by our application</li>
                    <li>You can revoke access at any time through your Google account settings</li>
                    <li>You agree to Google's Terms of Service when using this integration</li>
                  </ul>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">7. Intellectual Property</h2>
                  <p className="text-muted-foreground">
                    The Service, including its original content, features, and functionality, is owned by AdiGaze and is protected by international copyright, trademark, and other intellectual property laws.
                  </p>
                  <p className="text-muted-foreground mt-2">
                    You may not copy, modify, distribute, sell, or lease any part of our Service without explicit written permission.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">8. Disclaimer of Warranties</h2>
                  <p className="text-muted-foreground">
                    THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li>The Service will be uninterrupted, timely, secure, or error-free</li>
                    <li>The results obtained from using the Service will be accurate or reliable</li>
                    <li>Any errors in the Service will be corrected</li>
                  </ul>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">9. Limitation of Liability</h2>
                  <p className="text-muted-foreground">
                    TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL ADIGAZE, ITS DEVELOPERS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li>Loss of profits, data, or business opportunities</li>
                    <li>Personal injury or property damage</li>
                    <li>Unauthorized access to or alteration of your data</li>
                    <li>Any other matter relating to the Service</li>
                  </ul>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">10. Indemnification</h2>
                  <p className="text-muted-foreground">
                    You agree to indemnify and hold harmless AdiGaze, its developers, and affiliates from any claims, damages, losses, liabilities, and expenses (including legal fees) arising out of your use of the Service or violation of these Terms.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">11. Modifications to Service and Terms</h2>
                  <p className="text-muted-foreground">
                    We reserve the right to modify or discontinue the Service at any time without notice. We may also update these Terms from time to time. Continued use of the Service after any changes constitutes acceptance of the new Terms.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">12. Governing Law</h2>
                  <p className="text-muted-foreground">
                    These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">13. Severability</h2>
                  <p className="text-muted-foreground">
                    If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
                  </p>
                </section>

                <Separator />

                <section>
                  <h2 className="text-xl font-semibold text-foreground">14. Contact Information</h2>
                  <p className="text-muted-foreground">
                    For any questions or concerns regarding these Terms of Service, please contact us:
                  </p>
                  <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
                    <li>Developer: Adil Munawar</li>
                    <li>Email: adilmunawarx@gmail.com</li>
                    <li>WhatsApp: +92 324 4965220</li>
                  </ul>
                </section>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AppSidebarLayout>
  );
};

export default Legal;
