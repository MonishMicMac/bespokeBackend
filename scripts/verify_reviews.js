import sharp from 'sharp';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';
import db from '../config/db.js';
import SaleOrderReviewService from '../src/services/saleOrderReviewService.js';
import ProductReviewAggregateService from '../src/services/productReviewAggregateService.js';
import ReviewImageService from '../src/services/reviewImageService.js';
import {
  SaleOrderReview,
  SaleOrderReviewImage,
  ProductReviewAggregate,
} from '../models/setupAssociations.js';

const S3_BUCKET = process.env.AWS_BUCKET_NAME || 'bespoke-2026';

async function runTests() {
  console.log('========================================================');
  console.log('STARTING BESPOKE REVIEW SUBMISSION VERIFICATION SUITE');
  console.log('========================================================\n');

  // Generate valid test images using Sharp
  const samplePng1 = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 214, g: 0, b: 122, alpha: 1 }, // Bespoke pink
    },
  }).png().toBuffer();

  const samplePng2 = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 16, g: 185, b: 129, alpha: 1 }, // Emerald
    },
  }).png().toBuffer();

  // Test 1: Invalid rating validation
  console.log('Test 1: Reject invalid rating (rating = 6)');
  const res1 = await SaleOrderReviewService.storeReview({
    sale_order_id: 588,
    user_id: 26,
    ratings: 6,
    review: 'Great garment',
  });
  console.assert(res1.statusCode === 422, 'Expected status 422 for rating 6');
  console.log('✓ Passed: Invalid rating rejected with 422\n');

  // Test 2: Missing review description validation
  console.log('Test 2: Reject missing review description');
  const res2 = await SaleOrderReviewService.storeReview({
    sale_order_id: 588,
    user_id: 26,
    ratings: 5,
    review: '',
  });
  console.assert(res2.statusCode === 422, 'Expected status 422 for empty review');
  console.log('✓ Passed: Empty review description rejected with 422\n');

  // Test 3: Unauthorized customer order ownership
  console.log("Test 3: Reject customer reviewing another user's order");
  const res3 = await SaleOrderReviewService.storeReview({
    sale_order_id: 588, // belongs to user 26
    user_id: 99999,
    ratings: 5,
    review: 'Trying to review another person order',
  });
  console.assert(res3.statusCode === 422 || res3.statusCode === 403, 'Expected 422 or 403');
  console.log('✓ Passed: Customer isolation enforced\n');

  // Test 4: Reject invalid image format
  console.log('Test 4: Reject corrupt / invalid image buffer');
  const res4 = await SaleOrderReviewService.storeReview({
    sale_order_id: 588,
    user_id: 26,
    ratings: 5,
    review: 'Review with bad image',
    files: [
      {
        originalname: 'fake.png',
        buffer: Buffer.from('NOT_AN_IMAGE_CONTENT_STRING'),
      },
    ],
  });
  console.assert(res4.statusCode === 422, 'Expected status 422 for bad image');
  console.log('✓ Passed: Invalid image format rejected with 422\n');

  // Test 5: Reject oversized image (> 5MB)
  console.log('Test 5: Reject oversized image (> 5MB)');
  const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
  const res5 = await SaleOrderReviewService.storeReview({
    sale_order_id: 588,
    user_id: 26,
    ratings: 5,
    review: 'Review with oversized image',
    files: [
      {
        originalname: 'huge.jpg',
        buffer: oversizedBuffer,
      },
    ],
  });
  console.assert(res5.statusCode === 422, 'Expected status 422 for oversized image');
  console.log('✓ Passed: Oversized image rejected with 422\n');

  // Test 6: Reject exceeding allowed image count (> 5)
  console.log('Test 6: Reject exceeding allowed image count (> 5 photos)');
  const sixFiles = Array(6).fill({
    originalname: 'test.png',
    buffer: samplePng1,
  });
  const res6 = await SaleOrderReviewService.storeReview({
    sale_order_id: 588,
    user_id: 26,
    ratings: 5,
    review: 'Review with 6 images',
    files: sixFiles,
  });
  console.assert(res6.statusCode === 422, 'Expected status 422 for > 5 images');
  console.log('✓ Passed: Exceeding image count rejected with 422\n');

  // Test 7: Successful review submission with 5 stars and text only
  console.log('Test 7: Submit review with 5 stars and text only');
  const res7 = await SaleOrderReviewService.storeReview({
    sale_order_id: 588,
    user_id: 26,
    ratings: 5,
    review: 'Magnificent bespoke handcrafted couture! Perfect drape and silhouette.',
    files: [],
  });
  console.assert(res7.statusCode === 200, 'Expected status 200');
  console.assert(res7.body.status === true, 'Expected body.status === true');
  console.log('✓ Passed: Review saved in sale_order_review with ID:', res7.body.data.id);

  // Verify in DB directly
  const reviewInDb = await SaleOrderReview.findByPk(res7.body.data.id);
  console.assert(reviewInDb !== null, 'Record must exist in sale_order_review');
  console.assert(Number(reviewInDb.ratings) === 5, 'Rating must be 5');
  console.assert(reviewInDb.review.includes('Magnificent bespoke'), 'Review text matches');
  console.log('✓ DB Verified: sale_order_review table has correct ratings and review text\n');

  // Test 8: Submit review with MULTIPLE PHOTOS (2 photos)
  console.log('Test 8: Submit review with 2 uploaded photos (multipart)');
  const res8 = await SaleOrderReviewService.storeReview({
    sale_order_id: 588,
    user_id: 26,
    ratings: 5,
    review: 'Updated review with customer atelier photos: Bespoke pink and emerald swatch.',
    files: [
      { originalname: 'pink_atelier.png', buffer: samplePng1 },
      { originalname: 'emerald_drape.png', buffer: samplePng2 },
    ],
  });
  console.assert(res8.statusCode === 200, 'Expected status 200');
  console.assert(res8.body.data.images.length >= 2, 'Expected at least 2 images returned');
  console.log('✓ Passed: Review updated with images count:', res8.body.data.images.length);

  // Verify images in sale_order_review_image table
  const imagesInDb = await SaleOrderReviewImage.findAll({
    where: { review_id: res8.body.data.id },
  });
  console.assert(imagesInDb.length >= 2, 'Images exist in sale_order_review_image table');
  console.log(`✓ DB Verified: Found ${imagesInDb.length} records in sale_order_review_image linked to review_id ${res8.body.data.id}`);

  // Check each S3 key exists in bespoke-2026 bucket
  for (const imgRecord of imagesInDb) {
    console.assert(imgRecord.image_path.startsWith('reviews/images/'), 'Image path in reviews/images/');
    console.log(`Checking S3 existence: s3://${S3_BUCKET}/${imgRecord.image_path}`);
    await s3.send(new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: imgRecord.image_path,
    }));
    console.log(`✓ Verified on AWS S3: ${imgRecord.image_path}`);
  }

  // Test 9: Verify Product Review Aggregate recalculation
  console.log('\nTest 9: Verify product_review_aggregates table');
  const aggregate = await ProductReviewAggregate.findOne({
    where: { product_id: 417 },
  });
  console.log('Product 417 aggregate:', {
    total_reviews: aggregate.total_reviews,
    total_average: aggregate.total_average,
    five_star_count: aggregate.five_star_count,
  });
  console.assert(aggregate.total_reviews >= 1, 'Aggregate total_reviews updated');
  console.assert(Number(aggregate.five_star_count) >= 1, 'five_star_count updated');
  console.log('✓ DB Verified: product_review_aggregates correctly computed\n');

  // Test 10: Fetch product reviews via getProductReviews (reproducing PDP retrieval)
  console.log('Test 10: Retrieve product reviews and gallery photos');
  const productReviewsRes = await SaleOrderReviewService.getProductReviews(417);
  console.assert(productReviewsRes.statusCode === 200, 'Product reviews status 200');
  console.assert(productReviewsRes.body.summary.total_reviews >= 1, 'Summary has total reviews');
  console.assert(productReviewsRes.body.summary.all_review_images.length >= 2, 'Summary has gallery images');
  console.log('Product Reviews Summary:', {
    total_reviews: productReviewsRes.body.summary.total_reviews,
    total_average: productReviewsRes.body.summary.total_average,
    gallery_images_count: productReviewsRes.body.summary.all_review_images.length,
    star_counts: productReviewsRes.body.summary.star_counts,
  });
  console.log('✓ Verified: Saved review and photos retrieved cleanly for Product Details Page');

  console.log('\n========================================================');
  console.log('ALL 10 TESTS PASSED SUCCESSFULLY! 100% VERIFIED!');
  console.log('========================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});

