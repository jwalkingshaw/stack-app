import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { S3Service } from '@tradetool/storage';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  request: NextRequest,
  { params }: { params: { tenant: string } }
) {
  try {
    console.log('🔵 POST /upload - Starting server-side upload for tenant:', params.tenant);
    
    // Get authenticated user
    const { getUser } = getKindeServerSession();
    const user = await getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get organization by slug/tenant
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', params.tenant)
      .single();

    if (orgError || !organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }
    
    console.log('🔵 POST /upload - Auth success:', { orgId: organization.id, userId: user.id });

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const metadata = JSON.parse(formData.get('metadata') as string || '{}');
    const productLinkData = formData.get('productLink') ? JSON.parse(formData.get('productLink') as string) : null;

    console.log('🔵 POST /upload - Form data received:', { 
      filename: file?.name, 
      size: file?.size,
      type: file?.type,
      metadata,
      productLinkData 
    });

    if (!file) {
      console.log('🔴 POST /upload - No file provided');
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    console.log('🔵 POST /upload - Validating file...');
    
    // File validation
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/pdf'
    ];

    if (!allowedTypes.includes(file.type)) {
      console.log('🔴 POST /upload - Invalid file type:', file.type);
      return NextResponse.json(
        { error: `File type ${file.type} is not allowed` },
        { status: 400 }
      );
    }

    // File size validation (100MB max)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      console.log('🔴 POST /upload - File too large:', file.size);
      return NextResponse.json(
        { error: `File size exceeds maximum of ${maxSize} bytes` },
        { status: 400 }
      );
    }

    console.log('🔵 POST /upload - Uploading to S3...');
    
    // Initialize S3 service and upload file
    const s3Service = new S3Service();
    const s3Key = s3Service.generateAssetKey(organization.id, file.name);
    
    try {
      // Convert file to buffer for S3 upload
      const fileBuffer = await file.arrayBuffer();
      
      // Upload to S3 using direct client (we'll implement presigned URLs later)
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'ap-southeast-2',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });
      
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: s3Key,
        Body: Buffer.from(fileBuffer),
        ContentType: file.type,
      });
      
      await s3Client.send(uploadCommand);
      console.log('🟢 POST /upload - File uploaded to S3:', s3Key);
      
    } catch (s3Error) {
      console.error('🔴 POST /upload - S3 upload failed:', s3Error);
      return NextResponse.json(
        { error: 'Failed to upload file to storage' },
        { status: 500 }
      );
    }

    // Generate file path with S3 key
    const filePath = s3Key;
    
    // Determine asset type
    let assetType = 'other';
    if (file.type.startsWith('image/')) assetType = 'image';
    else if (file.type.startsWith('video/')) assetType = 'video';
    else if (file.type.includes('pdf')) assetType = 'document';

    // Generate public URL for the uploaded asset
    const publicUrl = s3Service.getPublicUrl(s3Key);
    
    // Create asset in dam_assets table (categorization will be done in bulk editing)
    const { data: createdAsset, error: assetError } = await supabase
      .from('dam_assets')
      .insert({
        organization_id: organization.id,
        filename: file.name,
        original_filename: file.name,
        file_type: assetType,
        file_size: file.size,
        mime_type: file.type,
        s3_key: filePath,
        s3_url: publicUrl,
        tags: [],
        created_by: user.id
      })
      .select()
      .single();

    if (assetError) {
      console.error('🔴 POST /upload - Database error:', assetError);
      return NextResponse.json({ error: 'Failed to save asset' }, { status: 500 });
    }

    console.log('🔵 POST /upload - Asset saved to database:', createdAsset.id);

    // Create product-asset link if product linking data is provided
    if (productLinkData && productLinkData.productId) {
      const { error: linkError } = await supabase
        .from('product_asset_links')
        .insert({
          organization_id: organization.id,
          product_id: productLinkData.productId,
          asset_id: createdAsset.id,
          asset_type: assetType,
          link_context: productLinkData.linkContext || 'upload',
          confidence: productLinkData.confidence || 0.8,
          match_reason: 'Manual linking during upload',
          link_type: 'manual',
          created_by: user.id
        });

      if (linkError) {
        console.error('🔴 POST /upload - Failed to create product link:', linkError);
        // Don't fail the upload, just log the error
      } else {
        console.log('🔵 POST /upload - Product link created successfully');
      }
    }

    const responseData = {
      data: createdAsset,
      message: "Asset uploaded successfully"
    };
    
    console.log('🟢 POST /upload - Upload completed successfully');
    
    return NextResponse.json(responseData);

  } catch (error) {
    console.error("🔴 POST /upload - Server-side upload failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

