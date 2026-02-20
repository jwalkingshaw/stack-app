/**
 * Kinde Management API client for organization management
 * Docs: https://kinde.com/api/docs/
 */

interface KindeOrganization {
  id: string;
  name: string;
  code: string;
  external_id?: string;
  is_default?: boolean;
}

interface CreateOrganizationRequest {
  name: string;
  code: string;
  external_id?: string;
}

class KindeManagementAPI {
  private baseURL: string;
  private clientId: string;
  private clientSecret: string;
  private audience: string;
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;
  private organizationsCache: { data: KindeOrganization[], expiry: number } | null = null;

  constructor() {
    this.baseURL = process.env.KINDE_MANAGEMENT_API_DOMAIN || '';
    this.clientId = process.env.KINDE_MANAGEMENT_CLIENT_ID || '';
    this.clientSecret = process.env.KINDE_MANAGEMENT_CLIENT_SECRET || '';
    this.audience = process.env.KINDE_MANAGEMENT_API_AUDIENCE || '';
  }

  /**
   * Get an access token for the Management API
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const tokenUrl = `${this.baseURL}/oauth2/token`;
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        audience: this.audience,
        scope: 'create:organizations read:organizations create:organization_users read:users create:users update:users',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get access token: ${response.status} ${error}`);
    }

    const data = await response.json();
    
    if (!data.access_token) {
      throw new Error('No access token received from Kinde');
    }
    
    this.accessToken = data.access_token;
    // Set expiry 5 minutes before actual expiry for safety
    this.tokenExpiry = Date.now() + ((data.expires_in || 3600) - 300) * 1000;
    
    return this.accessToken!;
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const token = await this.getAccessToken();
    
    const response = await fetch(`${this.baseURL}/api/v1${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Kinde API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  /**
   * Create a new organization in Kinde
   */
  async createOrganization(data: CreateOrganizationRequest): Promise<KindeOrganization> {
    console.log('Creating organization in Kinde:', data);
    
    const result = await this.makeRequest('/organization', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    return result.organization || result;
  }

  /**
   * Get organization by code - checks for EXACT match on external_id or code
   */
  async getOrganizationByCode(code: string): Promise<KindeOrganization | null> {
    try {
      console.log(`Checking if organization code '${code}' exists in Kinde...`);
      const result = await this.makeRequest(`/organizations?code=${encodeURIComponent(code)}`);
      console.log('Kinde organization check result:', result);
      
      // Find exact match on external_id or code field
      const exactMatch = result.organizations?.find((org: KindeOrganization) => 
        org.external_id === code || org.code === code
      );
      
      console.log(`🔍 Exact match for '${code}':`, exactMatch ? 'FOUND' : 'NOT FOUND');
      return exactMatch || null;
    } catch (error) {
      console.log('Kinde organization check error:', error);
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get all organizations (with 30 second cache for performance)
   */
  async getOrganizations(): Promise<{ organizations: KindeOrganization[] }> {
    try {
      // Return cached data if still valid (30 seconds)
      if (this.organizationsCache && Date.now() < this.organizationsCache.expiry) {
        console.log('🚀 Using cached Kinde organizations data');
        return { organizations: this.organizationsCache.data };
      }

      console.log('📡 Fetching fresh Kinde organizations data...');
      const result = await this.makeRequest('/organizations');
      console.log(`✅ Fetched ${result.organizations?.length || 0} organizations from Kinde API`);
      
      // Cache the result for 30 seconds
      this.organizationsCache = {
        data: result.organizations || [],
        expiry: Date.now() + 30000 // 30 seconds
      };
      
      return result;
    } catch (error) {
      console.error('Failed to get organizations from Kinde:', error);
      return { organizations: [] };
    }
  }

  /**
   * Get organization by ID
   */
  async getOrganization(id: string): Promise<KindeOrganization> {
    const result = await this.makeRequest(`/organizations/${id}`);
    return result.organization || result;
  }

  /**
   * Update organization
   */
  async updateOrganization(id: string, data: Partial<CreateOrganizationRequest>): Promise<KindeOrganization> {
    const result = await this.makeRequest(`/organizations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });

    return result.organization || result;
  }

  /**
   * Delete organization
   */
  async deleteOrganization(id: string): Promise<void> {
    await this.makeRequest(`/organizations/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * Add user to organization
   */
  async addUserToOrganization(orgId: string, userId: string): Promise<void> {
    console.log(`Adding user ${userId} to organization ${orgId}`);
    const payload = { users: [{ id: userId }] };
    console.log('User addition payload:', payload);
    
    const result = await this.makeRequest(`/organizations/${orgId}/users`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    console.log('User addition result:', result);
  }

  /**
   * Remove user from organization
   */
  async removeUserFromOrganization(orgId: string, userId: string): Promise<void> {
    console.log(`Removing user ${userId} from organization ${orgId}`);
    
    const result = await this.makeRequest(`/organizations/${orgId}/users/${userId}`, {
      method: 'DELETE',
    });
    
    console.log('User removal result:', result);
  }

  /**
   * Transfer user from one organization to another
   */
  async transferUserToOrganization(userId: string, fromOrgId: string, toOrgId: string): Promise<void> {
    console.log(`Transferring user ${userId} from ${fromOrgId} to ${toOrgId}`);

    try {
      // Step 1: Add user to new organization
      await this.addUserToOrganization(toOrgId, userId);
      console.log('✅ User added to new organization');

      // Step 2: Remove user from old organization
      await this.removeUserFromOrganization(fromOrgId, userId);
      console.log('✅ User removed from old organization');

    } catch (error) {
      console.error('❌ User transfer failed:', error);
      throw error;
    }
  }

  /**
   * Update an existing user's profile information
   */
  async updateUserProfile(
    userId: string,
    profile: { given_name?: string; family_name?: string; picture?: string }
  ): Promise<void> {
    console.log(`dY-^ Updating Kinde user profile for ${userId}:`, profile);

    await this.makeRequest(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ profile }),
    });
  }

  /**
   * Create a new user in Kinde
   */
  async createUser(email: string, givenName?: string, familyName?: string): Promise<any> {
    console.log('👤 Creating user in Kinde:', email);

    const payload = {
      profile: {
        given_name: givenName || email.split('@')[0],
        family_name: familyName || '',
      },
      identities: [
        {
          type: 'email',
          details: {
            email: email,
          },
        },
      ],
      // No password needed - Kinde will send one-time code for passwordless auth
    };

    try {
      const result = await this.makeRequest('/user', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      console.log('✅ User created in Kinde:', result.id || result.user?.id);
      return result.user || result;
    } catch (error) {
      // Check if user already exists
      if (error instanceof Error && (error.message.includes('409') || error.message.includes('already exists'))) {
        console.log('User already exists in Kinde, fetching user details');
        return await this.getUserByEmail(email);
      }
      throw error;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<any> {
    console.log('🔍 Fetching user by email:', email);

    try {
      const result = await this.makeRequest(`/users?email=${encodeURIComponent(email)}`);

      if (result.users && result.users.length > 0) {
        console.log('✅ User found in Kinde:', result.users[0].id);
        return result.users[0];
      }

      return null;
    } catch (error) {
      console.error('Failed to fetch user from Kinde:', error);
      return null;
    }
  }

  /**
   * Complete invitation flow: Create user and add to organization
   */
  async inviteUserToOrganization(
    email: string,
    kindeOrgId: string
  ): Promise<{ userId: string; isNewUser: boolean }> {
    try {
      console.log(`🎯 Inviting ${email} to organization ${kindeOrgId}`);

      // Try to get existing user first
      let user = await this.getUserByEmail(email);
      let isNewUser = false;

      if (!user) {
        // Create new user
        user = await this.createUser(email);
        isNewUser = true;
      }

      // Add user to organization
      await this.addUserToOrganization(kindeOrgId, user.id);

      console.log(`✅ User ${user.id} successfully added to organization`);

      return {
        userId: user.id,
        isNewUser,
      };
    } catch (error) {
      console.error('Error in inviteUserToOrganization:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const kindeAPI = new KindeManagementAPI();

// Export types
export type { KindeOrganization, CreateOrganizationRequest };
