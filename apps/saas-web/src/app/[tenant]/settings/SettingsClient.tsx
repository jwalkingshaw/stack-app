"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Settings,
  Users,
  CreditCard,
  Shield,
  Bell,
  Database,
  Key,
  Building2,
  User,
  Mail,
  Globe,
  Lock,
  Download,
  Trash2,
  Plus,
  Edit,
  Check,
  X,
  AlertTriangle,
  Zap,
  Crown,
  Calendar,
  Archive,
  FileText,
  Copy,
  Eye,
  EyeOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@tradetool/ui";
import { PageHeader } from "@/components/ui/page-header";

interface SettingsClientProps {
  tenantSlug: string;
}

export default function SettingsClient({ tenantSlug }: SettingsClientProps) {
  const router = useRouter();
  
  const [activeSection, setActiveSection] = useState("organization");
  const [loading, setLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [apiKeys, setApiKeys] = useState([
    { id: "1", name: "Production API", key: "sk-...", lastUsed: "2 hours ago", created: "2024-01-15" },
    { id: "2", name: "Development API", key: "sk-...", lastUsed: "1 day ago", created: "2024-01-10" }
  ]);
  const [teamMembers, setTeamMembers] = useState([
    { id: "1", name: "John Smith", email: "john@company.com", role: "Owner", status: "Active", joined: "2024-01-01" },
    { id: "2", name: "Sarah Chen", email: "sarah@company.com", role: "Admin", status: "Active", joined: "2024-01-05" },
    { id: "3", name: "Mike Johnson", email: "mike@company.com", role: "Editor", status: "Active", joined: "2024-01-10" },
    { id: "4", name: "Lisa Wong", email: "lisa@company.com", role: "Viewer", status: "Pending", joined: "2024-01-15" }
  ]);

  // Mock organization data - in real app this would come from API
  const [orgSettings, setOrgSettings] = useState({
    name: tenantSlug,
    description: "Digital asset management workspace",
    website: "https://company.com",
    logo: null,
    timezone: "UTC-8",
    language: "en"
  });

  const [billingInfo, setBillingInfo] = useState({
    plan: "Pro",
    status: "Active",
    nextBilling: "2024-02-15",
    storage: { used: 2100, limit: 5000 }, // MB
    members: { used: 4, limit: 15 },
    cost: 49
  });

  const [notifications, setNotifications] = useState({
    emailDigest: true,
    assetUploads: true,
    teamActivity: false,
    billingAlerts: true,
    securityAlerts: true
  });

  const [securitySettings, setSecuritySettings] = useState({
    twoFactorEnabled: false,
    sessionTimeout: 24, // hours
    ipRestriction: false,
    allowedIPs: "",
    auditLog: true
  });

  const settingsSections = [
    { id: "organization", label: "Organization", icon: Building2 },
    { id: "team", label: "Team Management", icon: Users },
    { id: "billing", label: "Billing & Plan", icon: CreditCard },
    { id: "storage", label: "Storage", icon: Database },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
    { id: "api", label: "API Keys", icon: Key }
  ];

  const handleCreateApiKey = () => {
    if (!newApiKeyName.trim()) return;
    
    const newKey = {
      id: Date.now().toString(),
      name: newApiKeyName,
      key: "sk-" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      lastUsed: "Never",
      created: new Date().toISOString().split('T')[0]
    };
    
    setApiKeys([...apiKeys, newKey]);
    setNewApiKeyName("");
    setShowApiKeyDialog(false);
  };

  const handleInviteUser = () => {
    if (!inviteEmail.trim()) return;
    
    const newMember = {
      id: Date.now().toString(),
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
      role: inviteRole,
      status: "Pending",
      joined: new Date().toISOString().split('T')[0]
    };
    
    setTeamMembers([...teamMembers, newMember]);
    setInviteEmail("");
    setInviteRole("viewer");
    setShowInviteDialog(false);
  };

  const renderOrganizationSettings = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Organization Details
          </CardTitle>
          <CardDescription>
            Manage your workspace information and branding
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Organization Name
              </label>
              <input
                type="text"
                value={orgSettings.name}
                onChange={(e) => setOrgSettings({ ...orgSettings, name: e.target.value })}
                className="w-full px-4 py-3 border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Website
              </label>
              <input
                type="url"
                value={orgSettings.website}
                onChange={(e) => setOrgSettings({ ...orgSettings, website: e.target.value })}
                className="w-full px-4 py-3 border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="https://yourcompany.com"
              />
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Description
            </label>
            <textarea
              value={orgSettings.description}
              onChange={(e) => setOrgSettings({ ...orgSettings, description: e.target.value })}
              className="w-full px-4 py-3 border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              rows={3}
              placeholder="Brief description of your organization..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Timezone
              </label>
              <select
                value={orgSettings.timezone}
                onChange={(e) => setOrgSettings({ ...orgSettings, timezone: e.target.value })}
                className="w-full px-4 py-3 border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              >
                <option value="UTC-8">Pacific Time (UTC-8)</option>
                <option value="UTC-5">Eastern Time (UTC-5)</option>
                <option value="UTC+0">UTC (UTC+0)</option>
                <option value="UTC+1">Central European Time (UTC+1)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Language
              </label>
              <select
                value={orgSettings.language}
                onChange={(e) => setOrgSettings({ ...orgSettings, language: e.target.value })}
                className="w-full px-4 py-3 border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
            </div>
          </div>
          
          <div className="flex justify-end">
            <Button>
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderTeamManagement = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Team Members ({teamMembers.length})
              </CardTitle>
              <CardDescription>
                Manage team access and permissions
              </CardDescription>
            </div>
            <Button onClick={() => setShowInviteDialog(true)}>
              <Plus className="w-4 h-4" />
              Invite Member
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {teamMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{member.name}</h3>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{member.role}</span>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        member.status === 'Active' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {member.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Joined {new Date(member.joined).toLocaleDateString()}</p>
                  </div>
                  <Button size="icon" variant="ghost">
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderBillingSettings = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-600" />
            Current Plan - {billingInfo.plan}
          </CardTitle>
          <CardDescription>
            Manage your subscription and billing details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-xl">
            <div>
              <h3 className="font-semibold text-foreground">Pro Plan</h3>
              <p className="text-sm text-muted-foreground">Perfect for growing teams</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-foreground">${billingInfo.cost}/month</div>
              <p className="text-sm text-muted-foreground">Billed monthly</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-foreground mb-3">Storage Usage</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Used</span>
                  <span>{(billingInfo.storage.used / 1000).toFixed(1)} GB of {billingInfo.storage.limit / 1000} GB</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div 
                    className="bg-primary h-3 rounded-full transition-all duration-300" 
                    style={{ width: `${(billingInfo.storage.used / billingInfo.storage.limit) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-foreground mb-3">Team Members</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Used</span>
                  <span>{billingInfo.members.used} of {billingInfo.members.limit} members</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div 
                    className="bg-green-500 h-3 rounded-full transition-all duration-300" 
                    style={{ width: `${(billingInfo.members.used / billingInfo.members.limit) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border border-border rounded-xl">
            <div>
              <h4 className="font-medium text-foreground">Next Billing Date</h4>
              <p className="text-sm text-muted-foreground">{new Date(billingInfo.nextBilling).toLocaleDateString()}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline">
                <Download className="w-4 h-4" />
                Download Invoice
              </Button>
              <Button>
                <CreditCard className="w-4 h-4" />
                Update Payment
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderStorageSettings = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Storage Management
          </CardTitle>
          <CardDescription>
            Monitor and manage your storage usage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="font-medium">Documents</h3>
                </div>
                <div className="text-2xl font-bold mb-2">245 MB</div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: '12%' }} />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <FileText className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="font-medium">Images</h3>
                </div>
                <div className="text-2xl font-bold mb-2">1.2 GB</div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: '58%' }} />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Archive className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="font-medium">Videos</h3>
                </div>
                <div className="text-2xl font-bold mb-2">655 MB</div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-purple-500 h-2 rounded-full" style={{ width: '30%' }} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-yellow-800">Storage Optimization</h4>
                <p className="text-sm text-yellow-700 mt-1">
                  You're using 42% of your storage limit. Consider upgrading your plan or cleaning up unused files to avoid reaching the limit.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div>
              <h4 className="font-medium text-foreground">Automatic Cleanup</h4>
              <p className="text-sm text-muted-foreground">Remove files older than 2 years</p>
            </div>
            <Button variant="outline">
              <Trash2 className="w-4 h-4" />
              Clean Up Storage
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderNotificationSettings = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Choose how you want to be notified about activity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(notifications).map(([key, value]) => {
            const labels = {
              emailDigest: "Email Digest",
              assetUploads: "Asset Uploads",
              teamActivity: "Team Activity",
              billingAlerts: "Billing Alerts",
              securityAlerts: "Security Alerts"
            };
            
            const descriptions = {
              emailDigest: "Weekly summary of workspace activity",
              assetUploads: "Notifications when team members upload new assets",
              teamActivity: "Updates on team member actions and changes",
              billingAlerts: "Important billing and subscription notifications",
              securityAlerts: "Security-related notifications and warnings"
            };

            return (
              <div key={key} className="flex items-center justify-between p-4 border border-border rounded-xl">
                <div>
                  <h4 className="font-medium text-foreground">{labels[key]}</h4>
                  <p className="text-sm text-muted-foreground">{descriptions[key]}</p>
                </div>
                <button
                  onClick={() => setNotifications({ ...notifications, [key]: !value })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                    value ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      value ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );

  const renderSecuritySettings = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security Settings
          </CardTitle>
          <CardDescription>
            Protect your workspace with advanced security features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border border-border rounded-xl">
            <div>
              <h4 className="font-medium text-foreground">Two-Factor Authentication</h4>
              <p className="text-sm text-muted-foreground">Add an extra layer of security to your account</p>
            </div>
            <Button variant={securitySettings.twoFactorEnabled ? "outline" : "default"}>
              {securitySettings.twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}
            </Button>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Session Timeout (hours)
            </label>
            <select
              value={securitySettings.sessionTimeout}
              onChange={(e) => setSecuritySettings({ ...securitySettings, sessionTimeout: parseInt(e.target.value) })}
              className="w-full max-w-xs px-4 py-3 border border-input rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            >
              <option value={1}>1 hour</option>
              <option value={8}>8 hours</option>
              <option value={24}>24 hours</option>
              <option value={168}>1 week</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-4 border border-border rounded-xl">
            <div>
              <h4 className="font-medium text-foreground">IP Restrictions</h4>
              <p className="text-sm text-muted-foreground">Only allow access from specific IP addresses</p>
            </div>
            <button
              onClick={() => setSecuritySettings({ ...securitySettings, ipRestriction: !securitySettings.ipRestriction })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                securitySettings.ipRestriction ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  securitySettings.ipRestriction ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-4 border border-border rounded-xl">
            <div>
              <h4 className="font-medium text-foreground">Audit Logging</h4>
              <p className="text-sm text-muted-foreground">Keep detailed logs of all workspace activity</p>
            </div>
            <button
              onClick={() => setSecuritySettings({ ...securitySettings, auditLog: !securitySettings.auditLog })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                securitySettings.auditLog ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  securitySettings.auditLog ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderApiKeys = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                API Keys ({apiKeys.length})
              </CardTitle>
              <CardDescription>
                Manage API keys for integrations and external access
              </CardDescription>
            </div>
            <Button onClick={() => setShowApiKeyDialog(true)}>
              <Plus className="w-4 h-4" />
              Create API Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {apiKeys.map((apiKey) => (
              <div key={apiKey.id} className="flex items-center justify-between p-4 border border-border rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Key className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{apiKey.name}</h3>
                    <p className="text-sm text-muted-foreground font-mono">{apiKey.key}...</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Last used: {apiKey.lastUsed}</p>
                    <p className="text-xs text-muted-foreground">Created: {new Date(apiKey.created).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" title="Copy API Key">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case "organization":
        return renderOrganizationSettings();
      case "team":
        return renderTeamManagement();
      case "billing":
        return renderBillingSettings();
      case "storage":
        return renderStorageSettings();
      case "notifications":
        return renderNotificationSettings();
      case "security":
        return renderSecuritySettings();
      case "api":
        return renderApiKeys();
      default:
        return renderOrganizationSettings();
    }
  };

  return (
    <>
      {/* Header */}
      <div className="bg-background border-b border-border px-4 py-6 shadow-soft">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
              <p className="text-muted-foreground mt-1">Manage your workspace preferences and configuration</p>
            </div>
            <Button variant="outline">
              <Download className="w-4 h-4" />
              Export Settings
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <div className="w-64 bg-background border-r border-border p-4 overflow-y-auto">
          <nav className="space-y-2">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                    activeSection === section.id
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {section.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-6 bg-background">
          <div className="max-w-4xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Create API Key Dialog */}
      <Dialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">
                Key Name
              </label>
              <input
                type="text"
                value={newApiKeyName}
                onChange={(e) => setNewApiKeyName(e.target.value)}
                placeholder="Enter a descriptive name..."
                className="mt-1 w-full px-3 h-8 border border-input rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowApiKeyDialog(false);
                  setNewApiKeyName("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateApiKey}
                disabled={!newApiKeyName.trim()}
              >
                Create API Key
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite User Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">
                Email Address
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@company.com"
                className="mt-1 w-full px-3 h-8 border border-input rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-foreground">
                Role
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="mt-1 w-full px-3 h-8 border border-input rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="viewer">Viewer - Can view assets</option>
                <option value="editor">Editor - Can upload and edit</option>
                <option value="admin">Admin - Full access except billing</option>
              </select>
            </div>
            
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowInviteDialog(false);
                  setInviteEmail("");
                  setInviteRole("viewer");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleInviteUser}
                disabled={!inviteEmail.trim()}
              >
                Send Invite
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}