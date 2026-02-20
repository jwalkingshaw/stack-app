'use client'

import Link from "next/link";
import { 
  BarChart3, 
  FolderOpen, 
  Users, 
  TrendingUp, 
  Upload,
  Eye,
  Download,
  Calendar,
  Settings,
  Plus,
  ArrowRight,
  Database,
  FileImage,
  Zap
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

interface DashboardClientProps {
  tenantSlug: string
}

export default function DashboardClient({ tenantSlug }: DashboardClientProps) {
  // No loading states - everything is pre-authenticated and ready
  return (
    <main className="w-full min-h-full">
      <PageHeader
        title="Dashboard"
      />
      
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Enhanced Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 mb-12 sm:mb-16">
            <Card variant="interactive" className="animate-slide-up" style={{animationDelay: '100ms'}}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Total Assets</CardTitle>
                <div className="p-2.5 bg-primary/10 rounded-xl">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-light text-foreground mb-2">1,234</div>
                <p className="text-sm text-green-600 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  12% from last month
                </p>
              </CardContent>
            </Card>

            <Card variant="interactive" className="animate-slide-up" style={{animationDelay: '200ms'}}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Downloads</CardTitle>
                <div className="p-2.5 bg-green-500/10 rounded-xl">
                  <Download className="h-5 w-5 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-light text-foreground mb-2">89</div>
                <p className="text-sm text-green-600 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  7% from last week
                </p>
              </CardContent>
            </Card>

            <Card variant="interactive" className="animate-slide-up" style={{animationDelay: '300ms'}}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Team Members</CardTitle>
                <div className="p-2.5 bg-purple-500/10 rounded-xl">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-light text-foreground mb-2">12</div>
                <p className="text-sm text-green-600 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  2 new this month
                </p>
              </CardContent>
            </Card>

            <Card variant="interactive" className="animate-slide-up" style={{animationDelay: '400ms'}}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Storage Used</CardTitle>
                <div className="p-2.5 bg-orange-500/10 rounded-xl">
                  <Database className="h-5 w-5 text-orange-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-light text-foreground mb-3">2.1 GB</div>
                <div className="w-full bg-muted rounded-full h-2.5 mb-2">
                  <div className="bg-orange-500 h-2.5 rounded-full transition-all duration-300" style={{width: '42%'}}></div>
                </div>
                <p className="text-sm text-muted-foreground">
                  of 5.0 GB limit
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Enhanced Main Tools Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8 mb-12 sm:mb-16">
            {/* Enhanced Digital Assets Card */}
            <Card variant="interactive" className="group animate-slide-up" style={{animationDelay: '500ms'}}>
              <Link href={`/${tenantSlug}/assets`} className="block h-full">
                <CardHeader className="pb-4">
                  <div className="flex items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">
                      <div className="p-3 sm:p-4 bg-primary/10 rounded-xl sm:rounded-2xl group-hover:bg-primary/20 transition-colors flex-shrink-0">
                        <FileImage className="w-6 sm:w-8 h-6 sm:h-8 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-xl sm:text-2xl font-semibold mb-1 sm:mb-2">Digital Assets</CardTitle>
                        <CardDescription className="text-sm sm:text-base">
                          Organize, search, and share your digital assets
                        </CardDescription>
                      </div>
                    </div>
                    <ArrowRight className="w-5 sm:w-6 h-5 sm:h-6 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-8 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4" />
                      <span className="font-medium">1,234 assets</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      <span className="font-medium">12 uploaded today</span>
                    </div>
                  </div>
                </CardContent>
              </Link>
            </Card>

            {/* Analytics (Coming Soon) */}
            <Card className="group opacity-75 cursor-not-allowed animate-slide-up" style={{animationDelay: '600ms'}}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-primary/10 rounded-2xl">
                      <BarChart3 className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-semibold mb-2">Analytics Dashboard</CardTitle>
                      <CardDescription className="text-base">
                        Track performance and team collaboration
                      </CardDescription>
                    </div>
                  </div>
                  <div className="text-xs bg-muted text-muted-foreground px-3 py-2 rounded-full font-medium">
                    Coming Soon
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-8 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    <span className="font-medium">Performance metrics</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    <span className="font-medium">Usage insights</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Campaign Management (Coming Soon) */}
            <Card className="group opacity-75 cursor-not-allowed animate-slide-up" style={{animationDelay: '700ms'}}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-green-500/10 rounded-2xl">
                      <Zap className="w-8 h-8 text-green-600" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-semibold mb-2">Campaign Management</CardTitle>
                      <CardDescription className="text-base">
                        Plan and execute marketing campaigns
                      </CardDescription>
                    </div>
                  </div>
                  <div className="text-xs bg-muted text-muted-foreground px-3 py-2 rounded-full font-medium">
                    Coming Soon
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-8 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span className="font-medium">Campaign planning</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span className="font-medium">Team coordination</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team & Settings */}
            <Card variant="interactive" className="group animate-slide-up" style={{animationDelay: '800ms'}}>
              <Link href={`/${tenantSlug}/settings`} className="block h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-purple-500/10 rounded-2xl group-hover:bg-purple-500/20 transition-colors">
                        <Settings className="w-8 h-8 text-purple-600" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl font-semibold mb-2">Workspace Settings</CardTitle>
                        <CardDescription className="text-base">
                          Manage team, billing, and preferences
                        </CardDescription>
                      </div>
                    </div>
                    <ArrowRight className="w-6 h-6 text-muted-foreground group-hover:text-purple-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-8 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span className="font-medium">12 team members</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      <span className="font-medium">Pro plan</span>
                    </div>
                  </div>
                </CardContent>
              </Link>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card variant="elevated" className="animate-slide-up" style={{animationDelay: '900ms'}}>
            <CardHeader>
              <CardTitle className="text-2xl">Recent Activity</CardTitle>
              <CardDescription className="text-base">Latest updates from your team</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-start space-x-4 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="w-3 h-3 bg-green-500 rounded-full mt-1 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">New product images uploaded</p>
                  <p className="text-sm text-muted-foreground mt-1">Added 15 high-resolution product shots to the Spring Collection folder</p>
                  <p className="text-xs text-muted-foreground mt-2 font-medium">2 hours ago</p>
                </div>
              </div>
              <div className="flex items-start space-x-4 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="w-3 h-3 bg-primary rounded-full mt-1 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Campaign assets shared with retailers</p>
                  <p className="text-sm text-muted-foreground mt-1">Marketing materials for Q2 campaign distributed to 5 retail partners</p>
                  <p className="text-xs text-muted-foreground mt-2 font-medium">5 hours ago</p>
                </div>
              </div>
              <div className="flex items-start space-x-4 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="w-3 h-3 bg-orange-500 rounded-full mt-1 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Team member invited</p>
                  <p className="text-sm text-muted-foreground mt-1">Sarah Chen joined the design team with editor permissions</p>
                  <p className="text-xs text-muted-foreground mt-2 font-medium">1 day ago</p>
                </div>
              </div>
            </CardContent>
          </Card>
      </div>
    </main>
  )
}