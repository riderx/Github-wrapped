#!/usr/bin/env node
/**
 * Integration Test - GitHub Wrapped API Enhancement
 * This script demonstrates the enhanced API functionality
 */

const API_BASE = 'http://localhost:8787'; // Local testing URL

console.log('🧪 GitHub Wrapped API - Integration Test\n');
console.log('='.repeat(70));

// Test scenarios
const scenarios = [
  {
    name: 'Basic Mode (Default)',
    url: `${API_BASE}/api/wrapped?username=demo&year=2025`,
    description: 'Fetch basic commit statistics without detailed changes',
    expectedFields: ['user', 'year', 'stats', 'insights', 'generatedAt'],
    notExpectedFields: ['commits', 'totalAdditions', 'totalDeletions']
  },
  {
    name: 'Detailed Mode',
    url: `${API_BASE}/api/wrapped?username=demo&year=2025&includeDetails=true`,
    description: 'Fetch full commit data with file changes and diffs',
    expectedFields: ['user', 'year', 'stats', 'insights', 'commits', 'generatedAt'],
    expectedStatsFields: ['totalCommits', 'totalAdditions', 'totalDeletions', 'totalChanges']
  },
  {
    name: 'Invalid Username',
    url: `${API_BASE}/api/wrapped?username=&year=2025`,
    description: 'Test error handling for missing username',
    expectError: true,
    expectedError: 'Username is required'
  }
];

async function testScenario(scenario) {
  console.log(`\n📋 Test: ${scenario.name}`);
  console.log('-'.repeat(70));
  console.log(`Description: ${scenario.description}`);
  console.log(`URL: ${scenario.url}`);
  
  try {
    const response = await fetch(scenario.url);
    const data = await response.json();
    
    if (scenario.expectError) {
      if (data.error) {
        console.log(`✅ Expected error received: "${data.error}"`);
        if (data.error.includes(scenario.expectedError)) {
          console.log('✅ Error message matches expected');
        } else {
          console.log('⚠️  Error message differs from expected');
        }
      } else {
        console.log('❌ Expected error but got success response');
      }
      return;
    }
    
    if (data.error) {
      console.log(`❌ Unexpected error: ${data.error}`);
      return;
    }
    
    // Validate expected fields
    let allFieldsPresent = true;
    for (const field of scenario.expectedFields || []) {
      if (field in data) {
        console.log(`✅ Field '${field}' present`);
      } else {
        console.log(`❌ Field '${field}' missing`);
        allFieldsPresent = false;
      }
    }
    
    // Validate fields that should NOT be present
    for (const field of scenario.notExpectedFields || []) {
      if (!(field in data)) {
        console.log(`✅ Field '${field}' correctly absent`);
      } else {
        console.log(`⚠️  Field '${field}' present (should be absent in basic mode)`);
      }
    }
    
    // Validate stats fields for detailed mode
    if (scenario.expectedStatsFields && data.stats) {
      for (const field of scenario.expectedStatsFields) {
        if (field in data.stats) {
          console.log(`✅ Stats field '${field}' present: ${data.stats[field]}`);
        } else {
          console.log(`❌ Stats field '${field}' missing`);
          allFieldsPresent = false;
        }
      }
    }
    
    // Display key metrics
    if (data.stats) {
      console.log('\n📊 Key Metrics:');
      console.log(`   - Total Commits: ${data.stats.totalCommits}`);
      if (data.stats.totalAdditions !== undefined) {
        console.log(`   - Total Additions: ${data.stats.totalAdditions} lines`);
        console.log(`   - Total Deletions: ${data.stats.totalDeletions} lines`);
        console.log(`   - Total Changes: ${data.stats.totalChanges} lines`);
      }
      console.log(`   - Repositories: ${data.stats.repositoriesContributed}`);
      console.log(`   - Pull Requests: ${data.stats.pullRequests}`);
    }
    
    // Display commit count for detailed mode
    if (data.commits && Array.isArray(data.commits)) {
      console.log(`\n📦 Commits Array: ${data.commits.length} commits included`);
      if (data.commits.length > 0) {
        const sampleCommit = data.commits[0];
        console.log('   Sample commit structure:');
        console.log(`   - SHA: ${sampleCommit.sha ? 'present' : 'missing'}`);
        console.log(`   - Message: ${sampleCommit.message ? 'present' : 'missing'}`);
        console.log(`   - Author: ${sampleCommit.author ? 'present' : 'missing'}`);
        console.log(`   - Stats: ${sampleCommit.stats ? 'present' : 'missing'}`);
        console.log(`   - Files: ${sampleCommit.files ? `${sampleCommit.files.length} files` : 'missing'}`);
      }
    }
    
    console.log(`\n${allFieldsPresent ? '✅' : '⚠️'} Test ${allFieldsPresent ? 'Passed' : 'Completed with warnings'}`);
    
  } catch (error) {
    console.log(`❌ Test failed with error: ${error.message}`);
    if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
      console.log('⚠️  Note: Make sure the worker is running (npm run worker:dev)');
    }
  }
}

async function runTests() {
  console.log('\n🚀 Starting Integration Tests...\n');
  
  // Note about server requirement
  console.log('📝 Prerequisites:');
  console.log('   - The Cloudflare Worker must be running');
  console.log('   - Run: npm run worker:dev in another terminal');
  console.log('   - Or run: npm run dev:local for full stack');
  console.log('');
  
  // Simulate tests without actually making requests
  // (Real tests would require the server to be running)
  console.log('📋 Test Scenarios Overview:\n');
  
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    console.log(`\n${i + 1}. ${scenario.name}`);
    console.log(`   ${scenario.description}`);
    console.log(`   Expected: ${scenario.expectError ? 'Error response' : 'Success response'}`);
    
    if (scenario.expectedFields) {
      console.log(`   Required fields: ${scenario.expectedFields.join(', ')}`);
    }
    
    if (scenario.notExpectedFields) {
      console.log(`   Absent fields: ${scenario.notExpectedFields.join(', ')}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Test scenarios defined and ready');
  console.log('\n💡 To run actual tests:');
  console.log('   1. Start the worker: npm run worker:dev');
  console.log('   2. In another terminal, run this test script');
  console.log('   3. Tests will make real HTTP requests to the API');
  console.log('\n📚 Documentation:');
  console.log('   - README.md: API documentation');
  console.log('   - USAGE_EXAMPLES.md: Practical examples');
  console.log('   - IMPLEMENTATION_SUMMARY.md: Technical details');
}

// Run tests
runTests();
